/**
 * PunchSection — the Today tab's punch block (story 20-3): the relocated
 * AttendanceTodayView subtree (punch tiles, button, messages, dialogs)
 * restyled to the approved mockup — PunchButton + PunchStatusCard — with
 * the geofence prescreen feeding the model. The press pipeline is the
 * SAME useCheckInOut contract (dialogs, rate-limit, idempotency, a11y
 * announcements): the move is a re-host, not a rewrite. The old
 * display-only distance hint is gone — the status card is its successor.
 *
 * Failure postures are inherited verbatim: the first-load shimmer and the
 * error + Retry block render NO interactive control (the holiday
 * pre-flight gate must be ABLE to fire before any check-in happens). A
 * settled server message outranks the status card (the server copy is the
 * truth surface — the old message-over-hint precedence).
 */
import { AccessibilityInfo } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarX, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Button, ConfirmDialog, Skeleton } from '../../../components/ui';
import { colors, fontSize, spacing } from '../../../theme';
import { useNow } from '../../../hooks';
import type { AttendanceSummaryState } from '../me/useAttendanceSummary';
import { formatOffsetInstantTime } from '../../../utils/offsetInstant';
import {
  buildTodayTiles,
  deriveTodayButtonState,
  punchStatusCard,
  type PunchOffice,
} from './attendanceTodayModel';
import { PunchButton } from './PunchButton';
import { PunchStatusCard } from './PunchStatusCard';
import { PunchCard } from './PunchCard';
import { HOLIDAY_DIALOG, LEAVE_DIALOG } from './checkInDialogs';
import { useCheckInOut } from './useCheckInOut';
import { usePunchPrescreen } from './usePunchPrescreen';
import type { AttendanceTodayRecord } from '../../../services/resources/attendanceMe';

interface Props {
  /** The summary hook's state + min-gapped refresh (the first-load Retry). */
  summary: { state: AttendanceSummaryState; refresh: () => void };
  /** Gap-bypassing forced refetch — post-write consistency + 409 recovery. */
  refreshSummaryNow: () => Promise<void>;
  /** Forced access-store refresh — the 403 mid-session-disable path. */
  refreshAccessNow: () => void;
  /** Bump to force a fresh fence probe (the host's pull-to-refresh). */
  refreshTick?: number;
}

export function PunchSection({
  summary,
  refreshSummaryNow,
  refreshAccessNow,
  refreshTick = 0,
}: Props) {
  const today = summary.state.summary?.today;
  const todayRecord = summary.state.summary?.todayRecord;

  const { fix, recapture, adoptFix } = usePunchPrescreen({ enabled: true });

  const onSettled = useCallback(() => {
    // The post-write pass refreshes the summary AND re-probes the fence —
    // the fresh record flips the ready posture, the fresh fix re-judges it.
    void refreshSummaryNow();
    recapture();
  }, [refreshSummaryNow, recapture]);

  const check = useCheckInOut({
    today,
    onSettled,
    onAccessDenied: refreshAccessNow,
  });

  // The press flow's own capture is the freshest fix the device ever held
  // (fresher than anything the cadence will get indoors) — adopt it so a
  // server-rejected too-far press renders the LOCKED card immediately
  // instead of the fallback while waiting for the next GPS win.
  useEffect(() => {
    if (check.lastFix) adoptFix(check.lastFix);
  }, [check.lastFix, adoptFix]);

  // The host's pull-to-refresh rides this tick: a manual refresh must also
  // re-probe the fence, not just the job list.
  useEffect(() => {
    if (refreshTick > 0) recapture();
  }, [refreshTick, recapture]);

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

  // The fence inputs: the anchored office from the summary (no pin ⇒ no
  // fence), the prescreen's freshest fix, and the clock — the rate-limit
  // countdown's 1 s tick and the 30 s cadence tick fold into one `now`.
  const cadence = useNow(30_000);
  const now = Math.max(check.now, cadence);
  const s = summary.state.summary;
  const office: PunchOffice | null =
    s?.officeLatitude != null && s?.officeLongitude != null
      ? {
          latitude: s.officeLatitude,
          longitude: s.officeLongitude,
          radiusM: s.officeRadius ?? null,
          name: s.officeName ?? null,
        }
      : null;

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
    now,
    fix,
    office,
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

  // The status card's time input (wall-clock rendering is the view's job):
  // the check-in instant formatted.
  const checkinTimeText = check.record ? formatTime(check.record.checkinAt) : null;

  // Card-vs-message precedence: a settled server message outranks the card
  // (the server copy is the authoritative explanation) — EXCEPT the locked
  // postures: when the fence verdict is on screen, the approved card is the
  // truth surface (it carries the same fact with the live distance) and the
  // flat server line would only duplicate it worse.
  const fenceLocked =
    !done && factsKnown &&
    (buttonState.kind === 'locked' || buttonState.kind === 'lockedOut');
  const statusCard =
    !done && factsKnown && (!check.message || fenceLocked)
      ? punchStatusCard({
          state: buttonState,
          fix,
          office,
          now,
          checkinTimeText,
        })
      : null;

  // The confirmation copy the hook has asked the view to present (20-1) —
  // null while no dialog is up.
  const confirmDialog =
    check.confirmAsk === 'leave'
      ? LEAVE_DIALOG
      : check.confirmAsk === 'holiday'
        ? HOLIDAY_DIALOG
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
              visible — the 16-4 AC; the tiles are the done render now). */}
          {!done ? (
            <>
              <PunchButton
                state={buttonState}
                enabled={factsKnown}
                onPress={onPress}
              />
              {statusCard ? (
                <View style={styles.cardWrap}>
                  <PunchStatusCard model={statusCard} />
                </View>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {check.message && !fenceLocked ? (
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
  cardWrap: {
    alignSelf: 'stretch',
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
