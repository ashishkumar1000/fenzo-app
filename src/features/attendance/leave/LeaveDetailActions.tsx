/**
 * LeaveDetailActions — the detail stage's bottom action slot (Story 17-7;
 * extracted from 17-6's LeaveDetailSheet under its ≤300 growth budget, the
 * EnrolmentRowActions precedent). One branch per actor/state:
 * - owner + pending: 17-6's mockup order `[Reject] [Approve]` — Approve is
 *   a single unconfirmed tap; Reject is two-stage (the stage-2 reason
 *   input is THIS component's state, reset per presentation).
 * - owner + approved: the outline-danger "Revoke leave" entry (secondary
 *   lg, `labelColor: colors.danger` — the landed Reject grammar; solid
 *   danger is reserved for the moment of commitment inside the stage).
 * - employee (readOnly) + pending/approved: the outline-danger "Cancel
 *   request" entry (never bare "Cancel" — on a sheet that reads as the
 *   dismissing action).
 * Terminal statuses render nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInputInstance } from 'react-native';
// eslint-disable-next-line prettier/prettier -- file budget: one import line
import { Button, Input } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';

const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;

export function LeaveDetailActions(input: {
  request: LeaveRequestRow;
  /** The employee-history read-only branch (D3): only the Cancel entry. */
  readOnly: boolean;
  /** true while the sheet is presented — resets the reject stage. */
  visible: boolean;
  /** Any host write in flight (buttons block + the sheet is pinned). */
  submitting: boolean;
  /** The approve write specifically (its button spins). */
  approveInFlight: boolean;
  /** The reject write specifically (its button spins). */
  rejectInFlight: boolean;
  onApprove: () => void;
  /** The trimmed reason — possibly '' (valid; the wire omits the field). */
  onReject: (reason: string) => void;
  /** The revoke entry renders only when the host owns the write. */
  onEnterRevoke?: () => void;
  /** The cancel entry renders only when the host owns the write. */
  onEnterCancel?: () => void;
}) {
  const { request, readOnly, visible, submitting, approveInFlight, rejectInFlight, onApprove, onReject, onEnterRevoke, onEnterCancel } = input;

  // Stage 2 (reveal the reason input) is action-local state, reset per
  // presentation — a stale stage from the previous request must not ride
  // along (the sheet's fresh-state idiom).
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

  if (readOnly) {
    if (
      onEnterCancel == null ||
      (request.status !== 'pending' && request.status !== 'approved')
    ) {
      return null;
    }
    return (
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        labelColor={colors.danger}
        onPress={onEnterCancel}
        disabled={submitting}>
        Cancel request
      </Button>
    );
  }

  if (request.status === 'pending') {
    if (rejectStage === 1) {
      return (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="lg"
            labelColor={colors.danger}
            style={styles.actionBtn}
            onPress={() => setRejectStage(2)}
            disabled={submitting}
            loading={rejectInFlight}>
            Reject
          </Button>
          <Button
            size="lg"
            style={styles.actionBtn}
            onPress={onApprove}
            disabled={submitting}
            loading={approveInFlight}>
            Approve
          </Button>
        </View>
      );
    }
    return (
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
          loading={rejectInFlight}>
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
    );
  }

  if (request.status === 'approved') {
    if (onEnterRevoke == null) return null;
    return (
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        labelColor={colors.danger}
        onPress={onEnterRevoke}
        disabled={submitting}>
        Revoke leave
      </Button>
    );
  }

  return null;
}

const styles = StyleSheet.create({
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
