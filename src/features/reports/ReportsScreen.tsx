/**
 * ReportsScreen — the owner's PDF reports (story 12-6, FR19–FR22).
 *
 * A full-screen root-stack route (covers the tab bar), opened from the
 * Account tab. Two halves:
 *
 * 1. Request form — range pickers + technician MultiSelect + Generate.
 *    Generate queues the request (async backend) with a fresh idempotency
 *    key; the new "Queued" row appears at the top of the history list.
 * 2. History list — newest-first rows from the `useReports` shared store.
 *    While anything is queued/generating the store polls every 5 s, and
 *    `report_ready`/`report_failed` Realtime events force-refetch it too —
 *    a row turns Ready without the user doing anything. Tapping a Ready row
 *    fetches a FRESH presigned URL from the status endpoint and hands it to
 *    the system viewer (presigned URLs are short-lived and never cached).
 *
 * Owner-only by construction: the route lives in the owner's
 * RootNavigator tree (App.tsx's role gate renders it for owners only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, FileText } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, IconButton, InlineError, Skeleton } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { reportService } from '../../services';
import type { ReportListItem } from '../../services';
import { ATTENDANCE_REPORT_TYPE, TECHNICIAN_JOB_ACTIVITY_TYPE } from '../../services/resources/reports';
import { officesService } from '../../services/resources/offices';
import { enrolmentsService } from '../../services/resources/enrolments';
import { openUrl } from '../../utils/linking';
import type { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { useTechnicians } from '../technicians';
import { useMyProfile } from '../profile/useMyProfile';
import { availableReportTypes } from './reportModel';
import { createReportRequest, loadReports, retryReportRequest, useReports } from './useReports';
import { failedReportCopy, todayIst } from './reportModel';
import { ReportRequestForm } from './components/ReportRequestForm';
import { ReportRow } from './components/ReportRow';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RootStackParamList, 'Reports'>,
  BottomTabScreenProps<MainTabParamList>
>;

/** The default range: the last 7 IST days (inclusive) — the window an
 *  owner most often reviews. Today's IST date anchors the picker maximum. */
function defaultRange(): { startDate: string; endDate: string } {
  const today = todayIst();
  const startMs = new Date(`${today}T00:00:00`).getTime() - 6 * 86_400_000;
  const start = todayIst(new Date(startMs).toISOString());
  return { startDate: start, endDate: today };
}

export default function ReportsScreen({ navigation }: Props) {
  const {
    reports,
    isLoading,
    error,
    isSubmitting,
    submitError,
    retryingId,
    retryError,
    isLoadingMore,
    hasMore,
    isPolling,
    syncPaused,
    refresh,
    loadMore,
  } = useReports();
  const { technicians } = useTechnicians();
  // The attendance report renders only when the tenant module flag is on
  // (the same /users/me mirror that gates the Home attendance tile; the
  // backend re-checks with ATTENDANCE_NOT_ENABLED either way).
  const { profile } = useMyProfile();
  const attendanceEnabled = profile?.attendance?.attendanceEnabled === true;
  const availableTypes = useMemo(
    () => availableReportTypes(attendanceEnabled),
    [attendanceEnabled],
  );
  // The form falls back to the first offered type when the selection is
  // not offered anymore (the gate flipped off mid-session) — the SUBMIT
  // must follow the same fallback, or it would send a type the form is
  // not showing, with stale office/employee selections.
  const [rawReportType, setRawReportType] = useState<string>(
    TECHNICIAN_JOB_ACTIVITY_TYPE,
  );
  const reportType =
    availableTypes.find(t => t.type === rawReportType)?.type ??
    availableTypes[0].type;

  const initialRange = useMemo(defaultRange, []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const todayIso = useMemo(() => todayIst(), []);

  // Attendance picker options — loaded lazily, once, when the type is first
  // selected. Offices come from the offices list; employees from the
  // enrolments roster, already filtered to ENROLLED people (the picker's
  // "All employees" placeholder means enrolled, never the whole roster).
  const [officeOptions, setOfficeOptions] = useState<{ id: string; name: string }[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const scopeLoadedRef = useRef(false);
  useEffect(() => {
    if (reportType !== ATTENDANCE_REPORT_TYPE || scopeLoadedRef.current) {
      return;
    }
    scopeLoadedRef.current = true;
    setIsLoadingScope(true);
    void (async () => {
      try {
        const [offices, roster] = await Promise.all([
          officesService.list(false),
          enrolmentsService.list(),
        ]);
        setOfficeOptions(
          offices
            .filter(o => o.archivedAt === null)
            .map(o => ({ id: o.id, name: o.name })),
        );
        setEmployeeOptions(
          roster
            .filter(r => r.attendanceStartDate !== null)
            .map(r => ({ id: r.employeeId, name: r.employeeName })),
        );
        setIsLoadingScope(false);
      } catch {
        // Un-latch: re-selecting the type retries the load — a one-off
        // failure must not leave the pickers empty until a remount.
        scopeLoadedRef.current = false;
        setIsLoadingScope(false);
        setOfficeOptions([]);
        setEmployeeOptions([]);
      }
    })();
  }, [reportType]);

  // Tap-to-open state: which row is opening (badge → "Opening…") and the
  // failure of the last open attempt (banner above the list).
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Success toast: auto-dismisses after 2s (AC 3)
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (!showSuccess) return undefined;
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  // "Sync paused" banner can be dismissed and re-shows on next sync pause (AC 5)
  const [showSyncPausedBanner, setShowSyncPausedBanner] = useState(false);
  useEffect(() => {
    if (syncPaused) {
      setShowSyncPausedBanner(true);
    }
  }, [syncPaused]);

  // Same local refresh spinner the sibling screens run — the store only
  // flips `isLoading` for an EMPTY list, so without this state the pull
  // spinner would snap shut the instant the gesture ended while the GET
  // was still in flight.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refresh]);

  // Same throttled focus refresh as the other tab-driven screens.
  useFocusEffect(
    useCallback(() => {
      void loadReports();
    }, []),
  );

  const handleSubmit = useCallback(() => {
    const isAttendance = reportType === ATTENDANCE_REPORT_TYPE;
    void createReportRequest({
      reportType,
      startDate,
      endDate,
      technicianIds: (isAttendance ? employeeIds : technicianIds).length > 0
        ? isAttendance
          ? employeeIds
          : technicianIds
        : null,
      officeIds: isAttendance && officeIds.length > 0 ? officeIds : undefined,
    })
      .then(() => {
        // Reset form and show success toast after submit per AC 3
        const range = defaultRange();
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        setTechnicianIds([]);
        setEmployeeIds([]);
        setOfficeIds([]);
        setShowSuccess(true);
      })
      .catch(() => {
        // The store holds `submitError` for the form's banner; nothing else to
        // do here — the row the submit would have created simply isn't there.
      });
  }, [reportType, startDate, endDate, technicianIds, employeeIds, officeIds]);

  const handleOpen = useCallback(
    async (item: ReportListItem) => {
      setOpeningId(item.id);
      setOpenError(null);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10_000),
        );
        const status = await Promise.race([
          reportService.getReportStatus(item.id),
          timeoutPromise,
        ]);
        if (status.status === 'ready' && status.file) {
          await openUrl(status.file.url);
        } else {
          // The row turned stale between render and tap (e.g. failed since).
          setOpenError(
            status.status === 'failed'
              ? failedReportCopy(status.error?.code)
              : 'This report is still generating. Try again shortly.',
          );
        }
      } catch (err) {
        const isTimeout = (err as Error)?.message === 'timeout';
        setOpenError(isTimeout ? 'Failed to open PDF — try again' : 'Could not open the report. Try again.');
      } finally {
        setOpeningId(null);
      }
    },
    [],
  );

  // Story 12-7: re-queue a failed row in place. The store force-refetches on
  // success — the row flips to "Queued" and polling arms itself via
  // `hasPending`. Failures surface through the store's `retryError`.
  const handleRetry = useCallback((item: ReportListItem) => {
    void retryReportRequest(item.id).catch(() => {
      // The store holds `retryError` for the banner above the list.
    });
  }, []);

  // One form element for both render branches (skeleton + main) — the
  // props are identical, so the type Select / pickers stay in sync.
  const form = (
    <ReportRequestForm
      reportType={reportType}
      availableTypes={availableTypes}
      startDate={startDate}
      endDate={endDate}
      selectedTechnicianIds={technicianIds}
      technicians={technicians}
      selectedOfficeIds={officeIds}
      offices={officeOptions}
      selectedEmployeeIds={employeeIds}
      employees={employeeOptions}
      isLoadingScope={isLoadingScope}
      todayIso={todayIso}
      isSubmitting={isSubmitting}
      submitError={submitError}
      onChange={next => {
        if (next.startDate !== undefined) setStartDate(next.startDate);
        if (next.endDate !== undefined) setEndDate(next.endDate);
        if (next.technicianIds !== undefined) {
          setTechnicianIds(next.technicianIds);
        }
        if (next.officeIds !== undefined) setOfficeIds(next.officeIds);
        if (next.employeeIds !== undefined) setEmployeeIds(next.employeeIds);
      }}
      onSelectType={setRawReportType}
      onSubmit={handleSubmit}
    />
  );

  // A failed load with nothing to show replaces the empty state entirely —
  // "no reports yet" would be a lie when the request just failed. The
  // `reports.length === 0` conjunct (not `!hasLoaded`): the store sets
  // hasLoaded true even on failure, so gating on it made the error view
  // unreachable for any load after the first, and a Retry press — with
  // isLoading true but no rows and no skeleton gate — silently showed
  // "No reports yet" until the request settled.
  const failedWithNoData = Boolean(error) && !isLoading && reports.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title}>Reports</Text>
        {isPolling ? (
          <Text style={styles.syncingIndicator}>Refreshing…</Text>
        ) : null}
      </View>

      {isLoading && reports.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {form}
          <Text style={styles.historyTitle}>History</Text>
          {/* Story 19-4 D2 — UX-DR5: the report-local skeleton became the
              shared DS `Skeleton`; identical output. */}
          <Skeleton />
        </ScrollView>
      ) : failedWithNoData ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={error ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void refresh()}>
            Retry
          </Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void onRefresh()}
            />
          }>
          {form}

          {showSuccess ? (
            <View style={[styles.successBanner]}>
              <Text style={styles.successText}>
                Report queued — you'll be notified when ready
              </Text>
            </View>
          ) : null}

          <Text style={styles.historyTitle}>History</Text>

          {openError || retryError ? (
            <InlineError message={retryError ?? openError ?? ''} />
          ) : null}

          {showSyncPausedBanner && syncPaused ? (
            <View style={styles.syncPausedBanner}>
              <View style={styles.syncPausedContent}>
                <Text style={styles.syncPausedText}>Couldn't refresh — pull to retry</Text>
              </View>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setShowSyncPausedBanner(false);
                  void refresh();
                }}
                style={styles.syncPausedButton}>
                Retry
              </Button>
            </View>
          ) : null}

          {reports.length === 0 ? (
            <EmptyState
              icon={<FileText size={30} color={colors.textMuted} strokeWidth={1.5} />}
              title="No reports yet"
              description="Create your first report to get started"
              style={styles.empty}
            />
          ) : (
            <>
              <View style={styles.rows}>
                {reports.map(item => (
                  <ReportRow
                    key={item.id}
                    item={item}
                    isOpening={openingId === item.id}
                    isRetrying={retryingId === item.id}
                    onPress={handleOpen}
                    onRetry={handleRetry}
                  />
                ))}
              </View>
              {hasMore ? (
                <Button
                  variant="secondary"
                  size="md"
                  loading={isLoadingMore}
                  disabled={isLoadingMore}
                  onPress={loadMore}
                  style={styles.loadMoreButton}>
                  Load more
                </Button>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    flex: 1,
  },
  syncingIndicator: {
    ...typography.caption,
    color: colors.textMuted,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
    flexGrow: 1,
  },
  historyTitle: {
    ...typography.labelStrong,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
  rows: {
    gap: spacing.s3,
  },
  loadMoreButton: {
    marginTop: spacing.s2,
  },
  empty: {
    flex: 0,
    paddingVertical: spacing.s8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  successBanner: {
    backgroundColor: colors.status.done.bg,
    borderRadius: 8,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  successText: {
    ...typography.caption,
    color: colors.status.done.solid,
  },
  syncPausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    gap: spacing.s2,
  },
  syncPausedContent: {
    flex: 1,
  },
  syncPausedText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  syncPausedButton: {
    paddingHorizontal: spacing.s2,
  },
});
