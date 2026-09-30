/**
 * RevokeSheet — the owner revoke STAGE (Story 17-7, spec D3), rendered
 * inside LeaveDetailSheet's native Sheet (a stage morph, not a stacked
 * sheet): split hero up front, the required reason input, and the
 * solid-danger confirm. The confirm is DISABLED until the reason is
 * filled (accessibilityState, the Correction-sheet gate — no error-
 * shaming banner; the gate also makes the wire's DTO 422 unreachable).
 * Nothing-actionable previews (nothing left to revoke) HIDE the confirm
 * and the reason — a permanently dead primary is a rote-click trap; Back
 * is the exit. The WRITE stays host-owned; while it is in flight Back is
 * disabled and the confirm spins (the host also flips the sheet's
 * `dismissible`).
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type TextInputInstance,
} from 'react-native';
import { Button, InlineError, InlineNotice, Input } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { istTodayDate } from '../../../utils/istDate';
import { LeaveSplitSummary } from './LeaveSplitSummary';
import { useLeaveActionPreview } from './useLeaveActionPreview';
import {
  buildLeaveSplitCopy,
  leaveConfirmContext,
  leaveConfirmLabel,
} from './leaveSplitModel';

const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;

export function RevokeSheet(input: {
  request: LeaveRequestRow;
  /** The host-owned write in flight. */
  submitting: boolean;
  /** The host write's failure message (null when none). */
  errorMessage: string | null;
  onBack: () => void;
  /** The trimmed reason — guaranteed non-empty by the gate. */
  onConfirm: (reason: string) => void;
  /** The both-arrays-empty notice's OK — closes the WHOLE sheet. */
  onDismissHandled: () => void;
}) {
  const { request, submitting, errorMessage, onBack, onConfirm, onDismissHandled } = input;

  // The preview is refetched on EVERY stage entry (fresh mount) — never
  // cached from a previous open (D1: cutoff- and midnight-sensitive).
  const { state: previewState, retry } = useLeaveActionPreview('revoke', request.id);
  const [reason, setReason] = useState('');
  const reasonRef = useRef<TextInputInstance>(null);

  // The stage mounts while the sheet is already presented — the right
  // moment to raise the keyboard (the 17-6 reject-stage idiom).
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  const copy =
    previewState.kind === 'loaded'
      ? buildLeaveSplitCopy(previewState.preview, istTodayDate())
      : null;
  const shape = copy?.shape ?? null;
  const compositeLabel = copy?.compositeLabel ?? null;

  // The live regions below are Android-only — iOS hears nothing on the
  // async preview arrival without an explicit announce (D6 floor: a
  // screen-reader user must not hear a spinner and silence). Re-fires when
  // the label changes (a fresh stage entry remounts, so every entry
  // announces once) (17-7 review).
  useEffect(() => {
    if (compositeLabel !== null) {
      AccessibilityInfo.announceForAccessibility(compositeLabel);
    }
  }, [compositeLabel]);
  const reasonFilled = reason.trim() !== '';
  // The gate: disabled until the reason is filled — and until the preview
  // has landed (D1: while loading the confirm renders disabled).
  const confirmDisabled =
    submitting || previewState.kind !== 'loaded' || !reasonFilled;

  const confirm = (
    <Button
      variant="danger"
      size="lg"
      fullWidth
      onPress={() => onConfirm(reason.trim())}
      disabled={confirmDisabled}
      loading={submitting}
      accessibilityState={{ disabled: confirmDisabled }}>
      {leaveConfirmLabel(
        'revoke',
        previewState.kind === 'loaded'
          ? leaveConfirmContext(previewState.preview)
          : 'whole',
      )}
    </Button>
  );

  if (previewState.kind === 'error') {
    return (
      <View style={styles.block}>
        <InlineError message={previewState.message} />
        <Button variant="secondary" size="lg" fullWidth onPress={retry}>
          Retry
        </Button>
        <Button variant="ghost" size="lg" fullWidth onPress={onBack} disabled={submitting}>
          Back
        </Button>
      </View>
    );
  }

  if (shape === 'already-handled') {
    // The stale-sheet shape (both arrays empty): the honest notice + OK
    // that closes the whole sheet.
    return (
      <View style={styles.block} accessibilityLiveRegion="polite">
        <InlineNotice message={copy!.compositeLabel} tone="neutral" />
        <Button variant="secondary" size="lg" fullWidth onPress={onDismissHandled}>
          OK
        </Button>
      </View>
    );
  }

  if (shape === 'nothing-actionable') {
    // Nothing remains to revoke: the confirm AND the reason are hidden —
    // Back/close are the exits (the dead-control rule).
    return (
      <View style={styles.block} accessibilityLiveRegion="polite">
        <InlineNotice message={copy!.compositeLabel} tone="neutral" />
        <Button variant="ghost" size="lg" fullWidth onPress={onBack} disabled={submitting}>
          Back
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {previewState.kind === 'loading' ? (
        <View style={styles.heroLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <LeaveSplitSummary preview={previewState.preview} today={istTodayDate()} />
      )}

      <View style={styles.reasonField}>
        <Input
          ref={reasonRef}
          label="Reason (required)"
          value={reason}
          onChangeText={setReason}
          placeholder="Why is this leave being revoked?"
          multiline
          maxLength={REASON_MAX}
          accessibilityLabel="Reason (required)"
        />
        <Text
          style={[
            styles.counter,
            reason.length >= REASON_NEAR_LIMIT ? styles.counterNearLimit : null,
          ]}>
          {reason.length} / {REASON_MAX}
        </Text>
      </View>

      {errorMessage !== null ? <InlineError message={errorMessage} /> : null}

      {confirm}
      <Button variant="ghost" size="lg" fullWidth onPress={onBack} disabled={submitting}>
        Back
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s2,
  },
  heroLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  reasonField: {
    gap: 0,
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
