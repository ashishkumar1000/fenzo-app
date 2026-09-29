/**
 * AttendanceTodayView.tsx — the Today section of the technician's
 * Attendance tab (Story 16-4, spec D11): office/timings line, the
 * CheckInOutButton, the outcome message area, the checked-in line and the
 * done summary card. Rendered for `active` only, ABOVE the summary view.
 *
 * Failure posture: while the summary's first load has not landed (loading
 * or errored), this section shows its own loading/error state and NO
 * interactive button — the holiday pre-flight gate must be ABLE to fire
 * before any check-in happens. A loaded summary whose `today` is absent
 * (pre-16-4 backend) renders legacy mode: interactive, no dialog, the
 * server still records the truth. The zero-state breaks from list density
 * on purpose: mostly whitespace, one CTA (DESIGN.md).
 */
import { AccessibilityInfo } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from '../../../components/ui';
import { colors, fontSize, radius, spacing } from '../../../theme';
import type { AttendanceSummaryState } from '../me/useAttendanceSummary';
import {
  formatDistance,
  haversineMetres,
} from '../../../utils/distanceUtils';
import { formatOffsetInstantTime } from '../../../utils/offsetInstant';
import {
  buildDoneCard,
  deriveTodayButtonState,
  formatCheckedInLine,
  offlineMessage,
} from './attendanceTodayModel';
import { CheckInOutButton } from './CheckInOutButton';
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

  const loaded = !summary.state.isLoading && !summary.state.error;
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

  const checkedInLine =
    check.record && !check.record.checkoutAt
      ? formatCheckedInLine(
          check.record,
          formatOffsetInstantTime(check.record.checkinAt),
        )
      : null;
  // The done card renders from the hook-local record wherever it exists —
  // the `todayRecord !== undefined` legacy gate applied only to CHECK-IN
  // interactivity, never to a completed day: on a pre-16-4 backend a
  // mid-session check-out must still replace the button (review patch:
  // legacy done-state dead end).
  const doneCard = check.record?.checkoutAt
    ? buildDoneCard(check.record, formatTime)
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
      <Text style={styles.officeLine} maxFontSizeMultiplier={1.4}>
        {officeLine(summary)}
      </Text>

      {summary.state.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : summary.state.error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{summary.state.error}</Text>
          <Button variant="secondary" size="md" onPress={summary.refresh}>
            Retry
          </Button>
        </View>
      ) : loaded && doneCard ? (
        <DoneCard card={doneCard} />
      ) : (
        <>
          {checkedInLine ? (
            <Text style={styles.checkedInLine} maxFontSizeMultiplier={1.4}>
              {checkedInLine}
            </Text>
          ) : null}
          <CheckInOutButton
            state={buttonState}
            enabled={factsKnown}
            onPress={onPress}
          />
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
      ) : distanceHint && !doneCard ? (
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
    </View>
  );
}

function officeLine(summary: { state: AttendanceSummaryState }): string {
  const s = summary.state.summary;
  if (!s?.officeName) return 'Your attendance';
  const times =
    s.startTime && s.endTime
      ? ` · ${to12Hour(s.startTime)} – ${to12Hour(s.endTime)}`
      : '';
  return `${s.officeName}${times}`;
}

/** "10:00" → "10:00 AM" (12-hour; the wire convention is HH:mm). */
function to12Hour(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const h24 = Number(match[1]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${match[2]} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function DoneCard({
  card,
}: {
  card: ReturnType<typeof buildDoneCard>;
}) {
  return (
    <View style={styles.doneCard}>
      <View style={styles.doneTimes}>
        <View style={styles.doneTimeBlock}>
          <Text style={styles.doneLabel}>Checked in</Text>
          <Text style={styles.doneTime}>{card.checkinText ?? '—'}</Text>
        </View>
        <View style={styles.doneTimeBlock}>
          <Text style={styles.doneLabel}>Checked out</Text>
          <Text style={styles.doneTime}>{card.checkoutText ?? '—'}</Text>
        </View>
      </View>
      <Text style={styles.doneWorked}>{card.workedText ?? ''}</Text>
      {card.lateText || card.earlyText ? (
        <Text style={styles.doneFlags}>
          {[card.lateText, card.earlyText].filter(Boolean).join(' · ')}
        </Text>
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
  officeLine: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  center: {
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s4,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.status.cancelled.fg,
    textAlign: 'center',
  },
  checkedInLine: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textStrong,
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
  doneCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.s4,
    alignItems: 'center',
    gap: spacing.s2,
  },
  doneTimes: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  doneTimeBlock: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  doneLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  doneTime: {
    fontSize: 36, // DESIGN.md checkin.time: the one display-size moment
    fontWeight: '700',
    color: colors.textStrong,
  },
  doneWorked: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.status.done.fg,
  },
  doneFlags: {
    fontSize: fontSize.sm,
    color: colors.status.scheduled.fg,
  },
});
