/**
 * CancelSheet — the employee cancel STAGE (Story 17-7, spec D4), rendered
 * inside LeaveDetailSheet's native Sheet (a stage morph): the split hero
 * and the solid-danger confirm — NO reason field anywhere (FR-15). The
 * split rendering is unconditional-with-degenerate-form: a past-Pending
 * request is a standing reality (apply up to 7 days back + Pending never
 * expires), so `keepDates` non-empty renders the split with "stay(s)
 * Pending"; keepDates-empty renders the single-line plain confirm. The
 * WRITE stays host-owned; while it is in flight Back is disabled and the
 * confirm spins (the host also flips the sheet's `dismissible`).
 */
import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, InlineError, InlineNotice } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { istTodayDate } from '../../../utils/istDate';
import { LeaveSplitSummary } from './LeaveSplitSummary';
import { useLeaveActionPreview } from './useLeaveActionPreview';
import {
  buildLeaveSplitCopy,
  leaveConfirmContext,
  leaveConfirmLabel,
} from './leaveSplitModel';

export function CancelSheet(input: {
  request: LeaveRequestRow;
  /** The host-owned write in flight. */
  submitting: boolean;
  /** The host write's failure message (null when none). */
  errorMessage: string | null;
  onBack: () => void;
  onConfirm: () => void;
  /** The both-arrays-empty notice's OK — closes the WHOLE sheet. */
  onDismissHandled: () => void;
}) {
  const { request, submitting, errorMessage, onBack, onConfirm, onDismissHandled } = input;

  // Refetched on EVERY stage entry (fresh mount) — never cached (D1).
  const { state: previewState, retry } = useLeaveActionPreview('cancel', request.id);

  const copy =
    previewState.kind === 'loaded'
      ? buildLeaveSplitCopy(previewState.preview, istTodayDate())
      : null;
  const shape = copy?.shape ?? null;
  const compositeLabel = copy?.compositeLabel ?? null;
  const confirmDisabled = submitting || previewState.kind !== 'loaded';

  // Same iOS announce as RevokeSheet (the live regions are Android-only;
  // D6 floor: no spinner-then-silence) (17-7 review).
  useEffect(() => {
    if (compositeLabel !== null) {
      AccessibilityInfo.announceForAccessibility(compositeLabel);
    }
  }, [compositeLabel]);

  const confirm = (
    <Button
      variant="danger"
      size="lg"
      fullWidth
      onPress={onConfirm}
      disabled={confirmDisabled}
      loading={submitting}
      accessibilityState={{ disabled: confirmDisabled }}>
      {leaveConfirmLabel(
        'cancel',
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
    // The request stays Pending — the notice acknowledges it; Back/close
    // are the exits (the dead-control rule).
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
});
