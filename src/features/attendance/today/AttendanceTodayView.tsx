/**
 * AttendanceTodayView.tsx — the Today section of the technician's
 * Attendance tab (Story 16-4, spec D11; redesigned 2026-10): the punch
 * card (tiles + status pills, PunchCard.tsx) and the CheckInOutButton.
 * The office/timings line moved to the summary card — the policy card is
 * the single home of those facts now. Rendered for `active` only, ABOVE
 * the summary view.
 *
 * Card presence: with NO record (the check-in zero-state) no card renders
 * — the zero-state's mostly-whitespace, one-CTA rule (DESIGN.md); as soon
 * as a record exists the punch card renders (mid-session: checkout tile
 * reads "—"). Failure posture: while the summary's first load has not
 * landed (loading or errored), this section shows its own loading/error
 * state and NO interactive button — the holiday pre-flight gate must be
 * ABLE to fire before any check-in happens. A loaded summary whose
 * `today` is absent (pre-16-4 backend) renders legacy mode: interactive,
 * no dialog, the server still records the truth.
 */
import { AccessibilityInfo } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarX, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Button, ConfirmDialog, Skeleton } from '../../../components/ui';
import { colors, fontSize, spacing } from '../../../theme';
import type { AttendanceSummaryState } from '../me/useAttendanceSummary';
import {
  formatDistance,
  haversineMetres,
} from '../../../utils/distanceUtils';
import { formatOffsetInstantTime } from '../../../utils/offsetInstant';
import {
  buildTodayTiles,
  deriveTodayButtonState,
  offlineMessage,
} from './attendanceTodayModel';
import { CheckInOutButton } from './CheckInOutButton';
import { PunchCard } from './PunchCard';
import { HOLIDAY_DIALOG, LEAVE_DIALOG } from './checkInDialogs';
import { useCheckInOut } from './useCheckInOut';
import type { AttendanceTodayRecord } from '../../../services/resources/attendanceMe';

interface Props {
  /** The summary hook's state + min-gapped refresh (the first-load Retry). */
  summary: { state: AttendanceSummaryState; refresh: () => void };
  /** Gap-bypassing forced refetch — post-write consistency + 409 recovery. */
  refreshSummaryNow: () => Promise<void>;
  /** Forced access-store refresh — the 403 mid-session-disable path. */
  refreshAccessNow: () => void;
}

export function AttendanceTodayView({
  summary,
  refreshSummaryNow,
  refreshAccessNow,
}: Props) {
  const today = summary.state.summary?.today;
  const todayRecord = summary.state.summary?.todayRecord;

  const check = useCheckInOut({
    today,
    onSettled: refreshSummaryNow,
    onAccessDenied: refreshAccessNow,
  });

  // The POST response owns the record mid-session (D12); the summary owns
  // it on load. seedRecord merges — a summary arrival never overwrites a
  // fresher local record.
  useEffect(() => {
    check.seedRecord(todayRecord);
  }, [todayRecord, check.seedRecord]);

  // Accessibility: every settled outcome announces (the 15-6 precedent) —
  // rejections via the message, the success transitions via the record.
  const announcedRef = useRef<string | null>(null);
  const messageText = check.message?.text ?? null;
  useEffect(() => {
    if (messageText && announcedRef.current !== messageText) {
      announcedRef.current = messageText;
      AccessibilityInfo.announceForAccessibility(messageText);
    }
  }, [messageText]);
  const prevRecordRef = useRef<AttendanceTodayRecord | null>(null);
  useEffect(() => {
    const prev = prevRecordRef.current;
    prevRecordRef.current = check.record;
    if (check.record === prev) return;
    const wasOpen = prev !== null && !prev.checkoutAt;
    const nowDone = check.record !== null && !!check.record.checkoutAt;
    if (nowDone && !(wasOpen && prev?.checkoutAt)) {
      AccessibilityInfo.announceForAccessibility('Checked out');
    } else if (check.record && !check.record.checkoutAt && !wasOpen) {
      AccessibilityInfo.announceForAccessibility('Checked in');
    }
  }, [check.record]);

  const formatTime = useCallback((iso: string) => formatOffsetInstantTime(iso), []);

  // undefined = legacy backend (no field on the wire) → interactive, no
  // dialog. null = explicitly no facts → NOT interactive (fail-safe).
  const factsKnown = today === undefined || today !== null;
  const buttonState = deriveTodayButtonState({
    permission: check.permission,
    online: check.online,
    factsKnown,
    record: check.record,
    resolving: check.resolving,
    dialogPending: check.dialogPending,
    rateLimitedUntil: check.rateLimitedUntil,
    now: check.now,
  });

  const onPress = useCallback(() => {
    if (
      buttonState.kind === 'permissionDenied' ||
      buttonState.kind === 'preciseOff' ||
      buttonState.kind === 'serviceOff'
    ) {
      check.openRemediation();
      return;
    }
    check.press(buttonState.kind === 'readyOut' ? 'check_out' : 'check_in');
  }, [buttonState.kind, check]);

  // The punch card renders from the hook-local record wherever it exists
  // — the `todayRecord !== undefined` legacy gate applied only to
  // CHECK-IN interactivity, never to a completed day: on a pre-16-4
  // backend a mid-session check-out must still replace the button
  // (review patch: legacy done-state dead end).
  const tilesModel = check.record
    ? buildTodayTiles(check.record, formatTime)
    : null;
  const done = buttonState.kind === 'done';
  // The confirmation copy the hook has asked the view to present (20-1) —
  // null while no dialog is up.
  const confirmDialog =
    check.confirmAsk === 'leave'
      ? LEAVE_DIALOG
      : check.confirmAsk === 'holiday'
        ? HOLIDAY_DIALOG
        : null;
  // The D7 display-only distance hint: the most recent capture fix vs the
  // office pin (haversine, never gating). Only when no server message is
  // showing — the too_far copy carries the authoritative distance.
  const distanceHint =
    !check.message &&
    check.lastFix &&
    summary.state.summary?.officeLatitude != null &&
    summary.state.summary?.officeLongitude != null
      ? `You are ${formatDistance(
          haversineMetres(check.lastFix, {
            latitude: summary.state.summary.officeLatitude,
            longitude: summary.state.summary.officeLongitude,
          }),
        ).replace(' away', '')} from ${summary.state.summary.officeName ?? 'your office'}`
      : null;

  return (
    <View style={styles.section}>
      {summary.state.isLoading ? (
        // First load: the card's content placeholder — a shimmer, labelled
        // (the 19-5 idiom); NO interactive button (the holiday pre-flight
        // gate must be ABLE to fire before any check-in happens).
        <View accessibilityLabel="Loading attendance" style={styles.skeleton}>
          <Skeleton rows={2} height={64} />
        </View>
      ) : summary.state.error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{summary.state.error}</Text>
          <Button variant="secondary" size="md" onPress={summary.refresh}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {tilesModel ? <PunchCard tiles={tilesModel} /> : null}
          {/* The done posture replaces the button ENTIRELY (never both
              visible — the 16-4 AC; the card is the done render now). */}
          {!done ? (
            <CheckInOutButton
              state={buttonState}
              enabled={factsKnown}
              onPress={onPress}
            />
          ) : null}
        </>
      )}

      {check.message ? (
        <Text
          style={[
            styles.message,
            check.message.tone === 'error'
              ? styles.messageError
              : styles.messageInfo,
          ]}
          maxFontSizeMultiplier={1.6}>
          {check.message.text}
        </Text>
      ) : distanceHint && !done ? (
        // D7: display-only, from the most recent capture fix — never gates
        // (NFR-2), and only while there is an action to take.
        <Text style={styles.messageInfo} maxFontSizeMultiplier={1.6}>
          {distanceHint}
        </Text>
      ) : null}

      {/* The offline block is a STATE, not just a tap outcome: the button
          disables itself (the tap can never fire), so the blocking message
          must render from the state — UX-DR8: the employee sees WHY before
          any tap. */}
      {buttonState.kind === 'offline' && !check.message ? (
        <Text style={[styles.message, styles.messageError]} maxFontSizeMultiplier={1.6}>
          {offlineMessage}
        </Text>
      ) : null}

      {/* The two pre-flight confirmations (16-4 holiday; 17-8 full-day
          leave) rendered as the shared ConfirmDialog (20-1 — the native
          Alerts' port): copy verbatim from checkInDialogs, the verdict
          settles the awaiting press continuation. No `submitting` — the
          dialog only decides; the press latch keeps the double-tap safety
          across dialog + submit. Confirm stays primary, not danger: like
          17-8's no-'destructive' ruling, checking in is a forward action
          with a stated side effect. */}
      {confirmDialog != null ? (
        <ConfirmDialog
          visible
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          icon={
            check.confirmAsk === 'leave' ? (
              <CalendarX size={20} color={colors.primary} strokeWidth={2} />
            ) : (
              <Sun size={20} color={colors.primary} strokeWidth={2} />
            )
          }
          onConfirm={() => check.settleConfirm(true)}
          onCancel={() => check.settleConfirm(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s3,
    alignItems: 'stretch',
    paddingVertical: spacing.s2,
  },
  center: {
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s4,
  },
  skeleton: {
    paddingVertical: spacing.s4,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.status.cancelled.fg,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: Math.round(fontSize.sm * 1.4),
  },
  messageError: {
    color: colors.status.cancelled.fg,
  },
  messageInfo: {
    color: colors.textMuted,
  },
});