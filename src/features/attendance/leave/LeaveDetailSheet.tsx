/**
 * LeaveDetailSheet — the leave request's detail + action sheet (Story 17-6,
 * spec D2). Owner mode: identity block, Type/Dates/Working days/Status
 * key–value rows, the verbatim reason in quotes, the split-only per-day
 * block, and — for a PENDING request — the mockup's action order
 * `[Reject] [Approve]`: Approve is a single unconfirmed tap; Reject is
 * two-stage (stage 2 reveals an optional reason input, a danger "Reject
 * request" and a ghost Back; the empty reason is valid). Read-only mode
 * (employee history, D3): identity hidden, actions absent, the reason and
 * per-day states fully visible.
 *
 * Lifecycle: the host owns the write; while it is in flight the sheet is
 * `dismissible={false}` (drag-down AND back blocked natively) and the
 * pressed button spins. A 409 `LEAVE_NOT_PENDING` swaps the content to the
 * neutral "This request was already handled" notice + an OK that closes —
 * deliberately NO auto-close timer; a failure keeps the sheet open with
 * the server's message above the buttons.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInputInstance } from 'react-native';
// eslint-disable-next-line prettier/prettier -- file budget: one import line
import { Avatar, Button, InlineError, InlineNotice, Input, Sheet } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveStatusBadge } from './LeaveRequestRow';
import {
  LEAVE_TYPE_LABELS,
  formatLeaveDate,
  formatLeaveRange,
  splitDaySummary,
  workingDaysCopy,
} from './leaveStatusModel';

/** The host-reported write state (the sheet never calls the API itself). */
export type LeaveDetailActionState =
  | { kind: 'idle' }
  | { kind: 'submitting'; action: 'approve' | 'reject' }
  | { kind: 'error'; message: string }
  /** 409 LEAVE_NOT_PENDING — content swaps to the notice + OK. */
  | { kind: 'handled' };

const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;

export function LeaveDetailSheet(input: {
  visible: boolean;
  request: LeaveRequestRow | null;
  /** true = the employee-history read-only sheet (D3). */
  readOnly?: boolean;
  actionState: LeaveDetailActionState;
  onClose: () => void;
  onApprove: () => void;
  /** The trimmed reason — possibly '' (valid; the wire omits the field). */
  onReject: (reason: string) => void;
  /** The already-handled notice's OK — closes the WHOLE sheet. */
  onDismissHandled: () => void;
}) {
  const { visible, request, readOnly = false, actionState, onClose, onApprove, onReject, onDismissHandled } = input;

  // Stage 2 (reveal the reason input) is sheet-local state, reset per
  // presentation — a stale stage from the previous request must not ride
  // along. Stage 2 mounts while the sheet is already presented — the right
  // moment for the keyboard (TrueSheet discourages focus DURING present).
  const [rejectStage, setRejectStage] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const reasonRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (visible) {
      setRejectStage(1);
      setReason('');
    }
  }, [visible]);

  useEffect(() => {
    if (rejectStage === 2) reasonRef.current?.focus();
  }, [rejectStage]);
  if (request == null) return null;

  const split = splitDaySummary(request.dates);
  const submitting = actionState.kind === 'submitting';
  const canAct = !readOnly && request.status === 'pending' && actionState.kind !== 'handled';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={readOnly ? 'Leave request' : request.employeeName ?? 'Leave request'}
      subtitle={readOnly ? undefined : 'Leave request'}
      detents={['auto']}
      dismissible={!submitting}>
      {actionState.kind === 'handled' ? (
        <>
          <InlineNotice message="This request was already handled" tone="neutral" />
          <Button variant="secondary" size="lg" fullWidth onPress={onDismissHandled}>
            OK
          </Button>
        </>
      ) : (
        <>
          {!readOnly ? (
            <View style={styles.identity}>
              <Avatar name={request.employeeName ?? ''} size="md" />
              <View style={styles.identityTexts}>
                <Text style={styles.identityName}>
                  {request.employeeName ?? 'Team member'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.kvRows}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Type</Text>
              <Text style={styles.kvValue}>{LEAVE_TYPE_LABELS[request.part]}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Dates</Text>
              <Text style={styles.kvValue}>
                {formatLeaveRange(request.startDate, request.endDate)}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Working days</Text>
              <Text style={styles.kvValue}>{workingDaysCopy(request.workingDays)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Status</Text>
              <LeaveStatusBadge status={request.status} size="sm" />
            </View>
          </View>

          {request.reason.trim() !== '' ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonText}>{`“${request.reason}”`}</Text>
            </View>
          ) : null}

          {split ? (
            <View style={styles.splitBlock}>
              {request.dates.map(day => (
                <View key={day.date} style={styles.splitRow}>
                  <Text style={styles.splitDate}>{formatLeaveDate(day.date)}</Text>
                  <LeaveStatusBadge status={day.state} size="sm" />
                </View>
              ))}
            </View>
          ) : null}

          {actionState.kind === 'error' ? (
            <InlineError message={actionState.message} />
          ) : null}

          {canAct && !readOnly ? (
            rejectStage === 1 ? (
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  size="lg"
                  labelColor={colors.danger}
                  style={styles.actionBtn}
                  onPress={() => setRejectStage(2)}
                  disabled={submitting}
                  loading={actionState.kind === 'submitting' && actionState.action === 'reject'}>
                  Reject
                </Button>
                <Button
                  size="lg"
                  style={styles.actionBtn}
                  onPress={onApprove}
                  disabled={submitting}
                  loading={actionState.kind === 'submitting' && actionState.action === 'approve'}>
                  Approve
                </Button>
              </View>
            ) : (
              <View style={styles.rejectStage}>
                <Input
                  ref={reasonRef}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Add a reason (optional)"
                  multiline
                  maxLength={REASON_MAX}
                  accessibilityLabel="Add a reason (optional)"
                />
                <Text
                  style={[
                    styles.counter,
                    reason.length >= REASON_NEAR_LIMIT ? styles.counterNearLimit : null,
                  ]}>
                  {reason.length} / {REASON_MAX}
                </Text>
                <Button
                  variant="danger"
                  size="lg"
                  fullWidth
                  onPress={() => onReject(reason.trim())}
                  disabled={submitting}
                  loading={actionState.kind === 'submitting' && actionState.action === 'reject'}>
                  Reject request
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  fullWidth
                  onPress={() => setRejectStage(1)}
                  disabled={submitting}>
                  Back
                </Button>
              </View>
            )
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  identityTexts: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  kvRows: {
    gap: spacing.s2,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    minHeight: 28,
  },
  kvLabel: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  kvValue: {
    ...typography.body,
    color: colors.textStrong,
    textAlign: 'right',
    flexShrink: 1,
  },
  reasonBox: {
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  reasonText: {
    ...typography.body,
    color: colors.textBody,
  },
  splitBlock: {
    gap: spacing.s2,
    backgroundColor: colors.surfacePage,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    minHeight: 28,
  },
  splitDate: {
    ...typography.bodySm,
    color: colors.textBody,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  actionBtn: {
    flex: 1,
  },
  rejectStage: {
    gap: spacing.s2,
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  counterNearLimit: {
    color: colors.status.scheduled.fg,
  },
});
