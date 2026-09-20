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
import { useCallback, useMemo, useState } from 'react';
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
import { Button, EmptyState, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { reportService, TECHNICIAN_JOB_ACTIVITY_TYPE } from '../../services';
import type { ReportListItem } from '../../services';
import { openUrl } from '../../utils/linking';
import type { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { useTechnicians } from '../technicians';
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
    hasLoaded,
    isSubmitting,
    submitError,
    retryingId,
    retryError,
    refresh,
  } = useReports();
  const { technicians } = useTechnicians();

  const initialRange = useMemo(defaultRange, []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const todayIso = useMemo(() => todayIst(), []);

  // Tap-to-open state: which row is opening (badge → "Opening…") and the
  // failure of the last open attempt (banner above the list).
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Same throttled focus refresh as the other tab-driven screens.
  useFocusEffect(
    useCallback(() => {
      void loadReports();
    }, []),
  );

  const handleSubmit = useCallback(() => {
    void createReportRequest({
      reportType: TECHNICIAN_JOB_ACTIVITY_TYPE,
      startDate,
      endDate,
      technicianIds: technicianIds.length > 0 ? technicianIds : null,
    })
      .then(() => {
        // Reset form after successful submit per AC 3
        const range = defaultRange();
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        setTechnicianIds([]);
      })
      .catch(() => {
        // The store holds `submitError` for the form's banner; nothing else to
        // do here — the row the submit would have created simply isn't there.
      });
  }, [startDate, endDate, technicianIds]);

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

  // A failed load with nothing to show replaces the empty state entirely —
  // "no reports yet" would be a lie when the request just failed.
  const failedWithNoData = Boolean(error) && !isLoading && !hasLoaded;

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
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
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
            <RefreshControl refreshing={false} onRefresh={() => void refresh()} />
          }>
          <ReportRequestForm
            startDate={startDate}
            endDate={endDate}
            selectedTechnicianIds={technicianIds}
            technicians={technicians}
            todayIso={todayIso}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onChange={next => {
              if (next.startDate !== undefined) setStartDate(next.startDate);
              if (next.endDate !== undefined) setEndDate(next.endDate);
              if (next.technicianIds !== undefined) {
                setTechnicianIds(next.technicianIds);
              }
            }}
            onSubmit={handleSubmit}
          />

          <Text style={styles.historyTitle}>History</Text>

          {openError || retryError ? (
            <InlineError message={retryError ?? openError ?? ''} />
          ) : null}

          {reports.length === 0 ? (
            <EmptyState
              icon={<FileText size={30} color={colors.textMuted} strokeWidth={1.5} />}
              title="No reports yet"
              description="Create your first report to get started"
              style={styles.empty}
            />
          ) : (
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
});