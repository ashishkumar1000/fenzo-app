/**
 * RosterScreen — the Team enrolment roster (Story 15-9), the ongoing
 * FR-2/FR-6 management surface outside the wizard. Entered from the
 * Attendance settings' third tile.
 *
 * Every row renders raw truth (see enrolmentsModel — never the
 * TENANT-module `attendanceEnabled` flag) and offers the full UX-DR9
 * contract: toggle-on with the inline office picker (the switch never
 * commits without an office), the "Starts today" chip for future-dating,
 * start restatement / cancel for upcoming rows, and reassignment with an
 * explicit effective date. Per-row writes latch individually; failures
 * land on the row and never touch its server state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, X, XCircle } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ConfirmDialog, EmptyState, InlineError, InlineNotice, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatLongDate, istTodayDate } from '../../../utils';
import type { RootStackParamList } from '../../../navigation/types';
import { useOffices } from '../offices/useOffices';
import ScreenHeader from '../offices/ScreenHeader';
import {
  reassignSheetDefaults,
  rowState,
  startChipParam,
  upcomingStart,
} from './enrolmentsModel';
import { useEnrolments } from './useEnrolments';
import { EnrolmentRow } from './EnrolmentRow';
import { OfficePickerSheet } from './OfficePickerSheet';
import { ReassignOfficeSheet } from './ReassignOfficeSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceEnrolments'>;

export default function RosterScreen({ navigation, route }: Props) {
  const today = istTodayDate();
  const offices = useOffices();
  const enrolments = useEnrolments({
    today,
    // An archived office must vanish from both pickers immediately.
    onOfficeArchived: () => offices.refresh(),
  });
  const { roster, refresh: refreshRoster } = enrolments;

  // The employee an enable-picker is open for (null = closed).
  const [pickingId, setPickingId] = useState<string | null>(null);
  // The employee the reassign sheet is open for (null = closed) + the
  // sheet's controlled effective date (the full-screen DatePicker returns
  // to THIS route, so the date lives here, not in the sheet).
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [sheetDate, setSheetDate] = useState(today);
  // Pre-picked start dates for never-enrolled rows ("Starts today" chip).
  // Screen-level so both enable paths (direct toggle-on and via picker)
  // carry the same pick; entries are discarded the moment the row's server
  // truth stops being never-enrolled.
  const [startPicks, setStartPicks] = useState<Record<string, string>>({});

  // 20-1 — the hard DELETE ask (the review finding: this screen confirms a
  // reassign and an office archive, but a switch-off deleted instantly).
  // 'disable' = the active row's switch-off; 'cancel-start' = the upcoming
  // row's cancel button. The DELETE fires only after the dialog confirms.
  const [deleteAsk, setDeleteAsk] = useState<{
    employeeId: string;
    kind: 'disable' | 'cancel-start';
  } | null>(null);
  const deleteRow =
    roster.find((r) => r.employeeId === deleteAsk?.employeeId) ?? null;

  useEffect(() => {
    setStartPicks((prev) => {
      const next: Record<string, string> = {};
      for (const [id, date] of Object.entries(prev)) {
        const row = roster.find((r) => r.employeeId === id);
        if (row && rowState(row, today) === 'never') {
          next[id] = date;
        }
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [roster, today]);

  // The full-screen DatePicker pops back merging { pickedDate, context } —
  // dispatch by context ONCE (a processed-signature ref: this effect's
  // dependencies change identity every render, and setParams clearing is
  // async — without the guard a pending param re-dispatches on each
  // render until it clears).
  const lastPickRef = useRef<string | null>(null);
  useEffect(() => {
    const { pickedDate, context } = route.params ?? {};
    if (!pickedDate || !context) return;
    const signature = `${context}|${pickedDate}`;
    if (lastPickRef.current === signature) return;
    lastPickRef.current = signature;
    navigation.setParams({ pickedDate: null, context: null });
    const [kind, employeeId] = context.split(':');
    if (kind === 'start') {
      const row = roster.find((r) => r.employeeId === employeeId);
      if (!row) return;
      if (rowState(row, today) === 'never') {
        setStartPicks((prev) => ({ ...prev, [employeeId]: pickedDate }));
      } else if (row.officeId) {
        // An upcoming row: picking a date in the picker restates the start
        // (the pick IS the confirmation — the date is already server truth).
        void enrolments.enable(employeeId, row.officeId, pickedDate);
      }
    } else if (kind === 'reassign') {
      setSheetDate(pickedDate);
    }
  }, [route.params, navigation, roster, today, enrolments]);

  // Pull-to-refresh (the 15-6 idiom) — announced to screen readers.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refreshRoster(), offices.refresh()]);
      AccessibilityInfo.announceForAccessibility('Team roster updated');
    } finally {
      setRefreshing(false);
    }
  }, [offices, refreshRoster, refreshing]);

  // Back that works from anywhere (deep links): the Settings screen pattern.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  /** The start param a toggle-on for this row should carry (undefined =
   *  omit → server-default today). */
  const pickFor = (employeeId: string) =>
    startChipParam(startPicks[employeeId], today);

  const onToggleOn = (employeeId: string, officeId: string | null) => {
    if (officeId) {
      void enrolments.enable(employeeId, officeId, pickFor(employeeId));
    } else {
      // No office yet — the picker opens NOW; the switch commits only on
      // a pick (UX-DR9). The chip's pre-pick rides along.
      setPickingId(employeeId);
    }
  };

  const onPickOffice = (officeId: string) => {
    const employee = roster.find((r) => r.employeeId === pickingId);
    setPickingId(null);
    if (!employee) return;
    void enrolments.enable(employee.employeeId, officeId, pickFor(employee.employeeId));
  };

  const firstLoadFailed = enrolments.error && !enrolments.hasLoaded;
  const reassignRow = roster.find((r) => r.employeeId === reassignId) ?? null;

  // 20-1 — the DELETE-ask dialog copy. `upcomingStart` gives the cancelled
  // start's date (guaranteed present by the ask-open guard); formatLongDate
  // matches the row's own "Starts …" wording.
  const cancelledStart = deleteRow ? upcomingStart(deleteRow, today) : null;
  const deleteTitle =
    deleteAsk?.kind === 'cancel-start' && cancelledStart != null
      ? `Cancel the ${formatLongDate(cancelledStart)} start?`
      : deleteRow != null
        ? `Turn off tracking for ${deleteRow.employeeName}?`
        : '';
  const deleteMessage = (() => {
    if (deleteRow == null || deleteAsk == null) return '';
    if (deleteAsk.kind === 'cancel-start') {
      // Unreachable without a start (the ask-open guard) — empty copy
      // rather than a fabricated date.
      if (cancelledStart == null) return '';
      return `${deleteRow.employeeName} was going to start being tracked from ${formatLongDate(cancelledStart)}. Cancelling this removes the start. You can add it again later.`;
    }
    return `${deleteRow.employeeName} will not be able to check in for attendance. Any planned change for them is also removed. You can turn it back on later.`;
  })();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Team enrolment" onBack={goBackSafely} />

      {enrolments.isLoading && !enrolments.hasLoaded ? (
        // First load: a roster-shaped shimmer, labelled (the 19-5 idiom).
        <View style={styles.skeleton} accessibilityLabel="Loading attendance">
          <Skeleton rows={8} height={80} />
        </View>
      ) : firstLoadFailed ? (
        <View style={styles.firstError}>
          <InlineError message="Couldn't load your team. Check your connection and try again." />
          <Button variant="secondary" onPress={() => void refreshRoster()}>
            Retry
          </Button>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={roster}
          keyExtractor={(row) => row.employeeId}
          ListHeaderComponent={
            <View style={styles.headerNotice}>
              <InlineNotice
                message="Turn tracking on per employee — they check in from their assigned office."
                tone="info"
                icon={null}
              />
            </View>
          }
          ListFooterComponent={
            roster.length > 0 ? (
              <View style={styles.footerCard}>
                <Text style={styles.footerText}>
                  Dates before someone's start date stay Not tracked — nobody is marked absent before tracking begins.
                </Text>
              </View>
            ) : (
              <></>
            )
          }
          renderItem={({ item }) => {
            const move = enrolments.scheduledMove(item.employeeId);
            const moveOffice = move
              ? offices.offices.find((o) => o.id === move.officeId)
              : null;
            return (
              <EnrolmentRow
                row={item}
                today={today}
                isPending={enrolments.isRowPending(item.employeeId)}
                hasError={enrolments.rowError(item.employeeId) !== null}
                pickedStart={startPicks[item.employeeId] ?? null}
                onPickStart={() => {
                  const row = roster.find((r) => r.employeeId === item.employeeId);
                  navigation.navigate('DatePicker', {
                    title: `Start date for ${item.employeeName}`,
                    value:
                      startPicks[item.employeeId] ??
                      (row ? upcomingStart(row, today) : null),
                    today,
                    minDate: today,
                    returnTo: 'AttendanceEnrolments',
                    context: `start:${item.employeeId}`,
                  });
                }}
                onToggleOn={() => onToggleOn(item.employeeId, item.officeId)}
                onDisable={() =>
                  setDeleteAsk({ employeeId: item.employeeId, kind: 'disable' })
                }
                onCancelStart={() => {
                  const row = roster.find((r) => r.employeeId === item.employeeId);
                  // The ask's copy names the cancelled start — ask only
                  // when the row carries one; a start-less row has no
                  // start to cancel, so no ask opens (never fabricate a
                  // date the wire did not supply).
                  if (row == null || upcomingStart(row, today) == null) return;
                  setDeleteAsk({
                    employeeId: item.employeeId,
                    kind: 'cancel-start',
                  });
                }}
                onChangeOffice={() => {
                  setReassignId(item.employeeId);
                  setSheetDate(reassignSheetDefaults(item, today).effectiveFrom);
                }}
                moveNote={
                  move
                    ? `Moves to ${moveOffice?.name ?? 'the chosen office'} from ${formatLongDate(move.effectiveFrom)}`
                    : null
                }
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={24} color={colors.primary} strokeWidth={1.5} />}
              title="Invite technicians first"
              description="Your team roster is empty. Invite technicians from the Home tab, then return here to enrol them."
            />
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {enrolments.error && enrolments.hasLoaded ? (
        <InlineError message="Couldn't refresh the roster. Showing the last loaded state." />
      ) : null}

      <OfficePickerSheet
        visible={pickingId !== null}
        employeeName={roster.find((r) => r.employeeId === pickingId)?.employeeName ?? null}
        offices={offices.activeOffices}
        onClose={() => setPickingId(null)}
        onPick={onPickOffice}
      />

      <ReassignOfficeSheet
        visible={reassignRow !== null}
        employeeName={reassignRow?.employeeName ?? null}
        offices={offices.activeOffices}
        defaultEffectiveFrom={
          reassignRow ? reassignSheetDefaults(reassignRow, today).effectiveFrom : today
        }
        minEffectiveFrom={
          reassignRow ? reassignSheetDefaults(reassignRow, today).minDate : today
        }
        effectiveFrom={sheetDate}
        onEffectiveFromChange={setSheetDate}
        onPickDate={() => {
          const min = reassignRow
            ? reassignSheetDefaults(reassignRow, today).minDate
            : today;
          navigation.navigate('DatePicker', {
            title: 'Effective from',
            value: sheetDate,
            today,
            minDate: min,
            returnTo: 'AttendanceEnrolments',
            context: 'reassign',
          });
        }}
        isSubmitting={reassignRow ? enrolments.isRowPending(reassignRow.employeeId) : false}
        onClose={() => setReassignId(null)}
        onConfirm={(officeId, effectiveFrom) => {
          const employee = reassignRow;
          if (!employee) return;
          // The sheet stays open (confirm spinning, dismissal blocked) until
          // the write settles — on failure the owner's selection survives
          // for a one-tap retry (review finding 7).
          void enrolments
            .reassign(employee.employeeId, officeId, effectiveFrom)
            .then((committed) => {
              if (committed) {
                setReassignId(null);
              }
            });
        }}
      />

      <ConfirmDialog
        visible={deleteAsk != null && deleteRow != null}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel={deleteAsk?.kind === 'cancel-start' ? 'Cancel start' : 'Turn off tracking'}
        confirmVariant="danger"
        icon={
          deleteAsk?.kind === 'cancel-start' ? (
            <X size={20} color={colors.danger} strokeWidth={2.2} />
          ) : (
            <XCircle size={20} color={colors.danger} strokeWidth={2} />
          )
        }
        cancelLabel={deleteAsk?.kind === 'cancel-start' ? 'Keep start' : 'Keep tracking'}
        submitting={deleteRow ? enrolments.isRowPending(deleteRow.employeeId) : false}
        onConfirm={() => {
          const ask = deleteAsk;
          setDeleteAsk(null);
          if (ask) void enrolments.disable(ask.employeeId);
        }}
        onCancel={() => setDeleteAsk(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  headerNotice: {
    marginBottom: spacing.s1,
  },
  footerCard: {
    marginTop: spacing.s2,
    padding: spacing.s4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  skeleton: {
    padding: spacing.s4,
  },
  firstError: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
});
