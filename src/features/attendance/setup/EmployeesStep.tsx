/**
 * EmployeesStep — wizard step 5 (Story 15-8), enrolment-lite. The roster
 * is `GET /attendance/enrolments` (every tenant technician joined with
 * their access state); each row is a required office + an enable toggle.
 *
 * UX-DR9 (switch-not-committed-until-office): toggling ON for an employee
 * with no office opens the office picker INLINE immediately and the switch
 * does not visually commit — its value is always the server's row state —
 * until a pick PUTs and the returned post-write state lands. Cancelling
 * the picker writes nothing and the switch springs back off. Toggling OFF
 * asks through the shared ConfirmDialog first (20-1), then DELETEs
 * (idempotent). Failures surface as the row's own banner and the
 * row keeps its pre-write server state (per-row retry = toggle again).
 *
 * Future start dates, reassignment and bulk-enable are 15-9's roster UI.
 * 15-9's one guard here: an UPCOMING row's switch is disabled with a hint
 * — a bare enable PUT clamps the start date to today and deletes the
 * future period (AD-8), so the wizard may never silently cancel a
 * future-dated enrolment; adjust it from the Team enrolment screen.
 */
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  InlineError,
  Skeleton,
  Switch,
} from '../../../components/ui';
import { XCircle } from 'lucide-react-native';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError, EnrolmentOverview } from '../../../services';
import type { Office } from '../../../types/office';
import { enrolmentCoversToday } from './wizardModel';
import { OfficePickerSheet } from '../enrolments/OfficePickerSheet';

type Props = {
  roster: EnrolmentOverview[];
  /** Live offices only (`archivedAt == null`) — the picker's options. */
  liveOffices: Office[];
  /** IST today (YYYY-MM-DD) — distinguishes a future-dated enrolment. */
  today: string;
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  rowError: (employeeId: string) => ApiError | null;
  isRowPending: (employeeId: string) => boolean;
  onEnable: (employeeId: string, officeId: string) => Promise<boolean>;
  onDisable: (employeeId: string) => Promise<boolean>;
};

export function EmployeesStep({
  roster,
  liveOffices,
  today,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  rowError,
  isRowPending,
  onEnable,
  onDisable,
}: Props) {
  // The employee the inline picker is open for (null = closed).
  const [pickingId, setPickingId] = useState<string | null>(null);
  // 20-1 — the switch-off DELETE ask (same posture as the roster screen:
  // the DELETE fires only after the shared ConfirmDialog confirms).
  const [disableAskId, setDisableAskId] = useState<string | null>(null);

  if (isLoading && !hasLoaded) {
    // First load: a roster-shaped shimmer, labelled (the 19-5 idiom); the
    // per-row write spinner below stays an action acknowledgment.
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading attendance">
        <Skeleton rows={4} height={80} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load your team. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  const pickerEmployee =
    roster.find((row) => row.employeeId === pickingId) ?? null;
  const disableRow =
    roster.find((row) => row.employeeId === disableAskId) ?? null;

  const onToggle = (row: EnrolmentOverview, nextValue: boolean) => {
    if (isRowPending(row.employeeId)) return;
    // Upcoming rows: the disabled switch already blocks this; the guard
    // keeps the "never silently cancel a future start" invariant local
    // (a bare enable clamps the start to today and deletes the period).
    const upcoming =
      row.attendanceStartDate !== null && !enrolmentCoversToday(row, today);
    if (nextValue && upcoming) return;
    if (!nextValue) {
      setDisableAskId(row.employeeId);
      return;
    }
    if (row.officeId) {
      void onEnable(row.employeeId, row.officeId);
    } else {
      // No office yet — the picker opens NOW; the switch commits only on
      // a pick (the value below is the server's row state, still false).
      setPickingId(row.employeeId);
    }
  };

  const onPickOffice = (officeId: string) => {
    const employee = pickerEmployee;
    setPickingId(null);
    if (!employee) return;
    // A failed PUT leaves the row's server state untouched — the switch
    // springs back off and the row's banner explains why.
    void onEnable(employee.employeeId, officeId);
  };

  return (
    <View style={styles.stack}>
      {roster.length === 0 ? (
        <EmptyState
          icon={<Users size={24} color={colors.primary} strokeWidth={1.5} />}
          title="Invite technicians first"
          description="Your team roster is empty. Invite technicians from the Home tab, then return here to enrol them."
        />
      ) : (
        roster.map((row) => {
          const rowErr = rowError(row.employeeId);
          // Raw enrolment truth (never the kill-switch-gated module flag —
          // see `enrolmentCoversToday`): covers-today drives the switch and
          // the "Office:" line; a future start renders as upcoming.
          const coversToday = enrolmentCoversToday(row, today);
          const upcomingStart =
            !coversToday && row.attendanceStartDate !== null
              ? row.attendanceStartDate
              : null;
          return (
            <Card key={row.employeeId} padding="md">
              <View style={styles.rowHead}>
                <View style={styles.rowIdentity}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.employeeName}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {coversToday
                      ? row.officeId
                        ? `Office: ${row.officeName ?? 'Unknown'}`
                        : 'No office assigned'
                      : upcomingStart !== null
                        ? row.officeId
                          ? `Starts ${upcomingStart} \u00B7 Office: ${row.officeName ?? 'Unknown'}`
                          : `Starts ${upcomingStart}`
                        : 'Not tracking attendance'}
                  </Text>
                </View>
                {/* In-flight write feedback: the switch is disabled while
                    the write is pending — the spinner makes the wait
                    legible (matches the 15-9 roster rows). */}
                {isRowPending(row.employeeId) ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : null}
              </View>
              <Switch
                value={coversToday}
                onValueChange={(nextValue) => onToggle(row, nextValue)}
                label={
                  upcomingStart !== null
                    ? `Starts ${upcomingStart} \u00B7 tracking begins then — adjust from Team enrolment`
                    : `Track attendance for ${row.employeeName}`
                }
                disabled={isRowPending(row.employeeId) || upcomingStart !== null}
              />
              {rowErr ? (
                <View style={styles.rowError}>
                  <InlineError message="Couldn't save this change. Try again." />
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <OfficePickerSheet
        visible={pickerEmployee !== null}
        employeeName={pickerEmployee?.employeeName ?? null}
        offices={liveOffices}
        emptyMessage="No offices yet. Add one from the Offices step first."
        onClose={() => setPickingId(null)}
        onPick={onPickOffice}
      />

      <ConfirmDialog
        visible={disableRow != null}
        title={`Turn off tracking for ${disableRow?.employeeName ?? ''}?`}
        message={`${disableRow?.employeeName ?? ''} will not be able to check in for attendance. Any planned change for them is also removed. You can turn it back on later.`}
        confirmLabel="Turn off tracking"
        confirmVariant="danger"
        icon={<XCircle size={20} color={colors.danger} strokeWidth={2} />}
        cancelLabel="Keep tracking"
        onConfirm={() => {
          const id = disableAskId;
          setDisableAskId(null);
          if (id) void onDisable(id);
        }}
        onCancel={() => setDisableAskId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  rowHead: {
    marginBottom: spacing.s2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  rowSub: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rowError: {
    marginTop: spacing.s2,
  },
});
