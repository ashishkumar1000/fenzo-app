/**
 * DayDetailSheet — the FR-25 day sheet (Story 18-3 D5). Presentational over
 * the host's CURRENT row: `{ day }` re-renders live — never a mount-time
 * snapshot. Detail content: the full StatusBadge; the WRAPPING flag-tag
 * row; labelled value rows (OMISSION RULE: a line with no value renders
 * nothing — no placeholder dashes). Distance lines: the wire metres are
 * the GPS-measured distance — non-null → " · 42 m from {officeName}",
 * exactly 0 → " · At the office"; a checkout carried on a later date
 * appends "(next day)". Corrections (note quote + history) live in
 * CorrectionHistory.
 *
 * 18-4 stages (spec D1/D2 — a morph INSIDE this sheet, never a stacked
 * sheet; the 17-7 doctrine): `detail → correct → detail`. The owner-only
 * "Correct day" entry renders only when `canCorrectDay` holds AND the host
 * passed the write plumbing; the proof pane passes `readOnly` (canned data
 * + a placeholder UUID would 404 no-leak) and never sees it. The correct
 * stage keeps the day title and shows the day's times line as the subtitle
 * (the mock's sub-slot), mounts CorrectionStage FRESH per entry, and
 * morphs back on a saved write (D5), after which the host refreshes.
 *
 * Write posture (D4): the press LATCHES in a ref (no idempotency key on
 * the wire — a same-tick double-tap would file TWO audit rows), one
 * release in `finally`; while in flight the sheet is `dismissible={false}`
 * and Back is disabled. A press-time offline probe shows the offline copy
 * and keeps every entry; a server failure renders its message verbatim; a
 * transport failure the connection line — mode, fields and note survive.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import type { CorrectionWriteBody } from '../../../services/resources/attendanceCorrections';
import type { MonthStatusesScope } from './useMonthStatuses';
import {
  canCorrectDay,
  dayLabel,
  dayMonthLabel,
  daySheetTitle,
  dayTimesLine,
  instantValue,
  workedValue,
} from './dayDetailModel';
import { dayFlagVisuals, softBadgeIcon, DAY_STATUS_VISUALS } from './dayStatusVisual';
import { CorrectionHistory } from './CorrectionHistory';
import { CorrectionStage } from './CorrectionStage';
import {
  OFFLINE_SAVE_MESSAGE,
  isOfflineNow,
  saveErrorMessage,
} from './correctionSavePosture';

/** The stage morph (D2): detail → correct → detail. */
type DetailStage = 'detail' | 'correct';

export type DayDetailSheetProps = {
  visible: boolean;
  /** The tapped day — drives the title, the history key and the announce. */
  workDate: string | null;
  /** The host's CURRENT row for that day (null → "Not tracked" posture). */
  day: DayStatusRow | null;
  scope: MonthStatusesScope;
  /** The wire's tenant-local today echo — the D1 gate is data-driven. */
  today: string | null;
  onClose: () => void;
  /** The proof pane's posture: suppresses the Correct entry entirely. */
  readOnly?: boolean;
  /** The bound write (`correctDay`) — absent means no entry renders. */
  onCorrect?: (body: CorrectionWriteBody) => Promise<unknown>;
  /** The post-save host refresh (the D5 non-clearing month refresh). */
  onCorrected?: () => void;
};

/** One labelled value row; a null/empty value renders NOTHING (the
 *  omission rule). */
function ValueRow({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function DayDetailSheet({
  visible,
  workDate,
  day,
  scope,
  today,
  onClose,
  readOnly = false,
  onCorrect,
  onCorrected,
}: DayDetailSheetProps) {
  const [stage, setStage] = useState<DetailStage>('detail');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The submit latch (D4): `saving` is async state — a same-tick
  // double-tap would file two audit rows before re-render.
  const latchRef = useRef(false);

  // Announce on present (the a11y floor): "Day detail, {d} {Month}".
  useEffect(() => {
    if (visible && workDate != null) {
      AccessibilityInfo.announceForAccessibility(
        `Day detail, ${daySheetTitle(workDate).split(', ')[1]}`,
      );
    }
  }, [visible, workDate]);

  // The stage never survives a close or a day switch — a reopen (or a
  // mid-open re-pick) lands on the detail stage with no carried form
  // state (the CorrectionSheet cross-day-leak rule; the LeaveDetailSheet
  // visible-reset idiom).
  useEffect(() => {
    if (visible) setStage('detail');
  }, [visible, workDate]);

  // The stage announce (18-4 a11y): the morph under the same heading is
  // invisible to a screen reader without it.
  useEffect(() => {
    if (visible && stage === 'correct' && workDate != null) {
      AccessibilityInfo.announceForAccessibility(
        `Correct attendance, ${dayMonthLabel(workDate)}`,
      );
    }
  }, [visible, stage, workDate]);

  const status = day?.status ?? 'not_tracked';
  const visual = DAY_STATUS_VISUALS[status];
  const flags = day ? dayFlagVisuals(day) : [];
  const latest = day?.latestCorrection;

  const canEnter =
    !readOnly &&
    onCorrect != null &&
    workDate != null &&
    canCorrectDay(day, today, scope);

  const handleSave = async (body: CorrectionWriteBody) => {
    if (latchRef.current || onCorrect == null) return;
    latchRef.current = true;
    setSaveError(null);
    setSaving(true);
    try {
      if (await isOfflineNow()) {
        setSaveError(OFFLINE_SAVE_MESSAGE);
        return;
      }
      await onCorrect(body);
      // D5: the stage morphs back to detail; the HOST refreshes — the row
      // (and the calendar cell) swap in place when the refetch lands.
      setStage('detail');
      // The morph-back swaps content under the same heading — invisible to
      // a screen reader without an explicit saved cue (the stage-announce
      // floor; triage patch 18-4-review).
      AccessibilityInfo.announceForAccessibility('Correction saved');
      onCorrected?.();
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      latchRef.current = false;
      setSaving(false);
    }
  };

  const enterStage = () => {
    setSaveError(null);
    setStage('correct');
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={workDate != null ? daySheetTitle(workDate) : 'Day detail'}
      subtitle={stage === 'correct' ? dayTimesLine(day) ?? undefined : undefined}
      detents={['auto']}
      dismissible={!saving}>
      {stage === 'correct' && canEnter && workDate != null ? (
        <CorrectionStage
          workDate={workDate}
          day={day}
          submitting={saving}
          errorMessage={saveError}
          onBack={() => setStage('detail')}
          onSave={handleSave}
        />
      ) : (
        <>
          <Badge
            status={visual.badgeStatus}
            icon={softBadgeIcon(visual.icon, visual.badgeStatus)}>
            {dayLabel(day)}
          </Badge>

          {day != null && flags.length > 0 ? (
            // WRAPPING row: a clipped trust flag is a trust failure.
            <View style={styles.flagRow}>
              {flags.map(flag => (
                <Badge
                  key={flag.key}
                  status={flag.badgeStatus}
                  size="sm"
                  icon={softBadgeIcon(flag.icon, flag.badgeStatus)}>
                  {flag.label}
                </Badge>
              ))}
            </View>
          ) : null}

          {day != null ? (
            <View style={styles.kvRows}>
              {(
                [
                  ['Check-in', instantValue(day.checkinAt, day.checkinDistanceM, day.officeName, day.workDate)],
                  ['Check-out', instantValue(day.checkoutAt, day.checkoutDistanceM, day.officeName, day.workDate)],
                  ['Worked', workedValue(day)],
                  ['Office', day.officeName],
                ] as const
              ).map(([label, value]) => (
                <ValueRow key={label} label={label} value={value} />
              ))}
            </View>
          ) : null}

          {latest != null && latest.note.trim() !== '' ? (
            <Text style={styles.quote}>{`“${latest.note}”`}</Text>
          ) : null}

          {workDate != null ? (
            <CorrectionHistory
              visible={visible}
              workDate={workDate}
              hasCorrection={latest != null}
              scope={scope}
            />
          ) : null}

          {canEnter ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onPress={enterStage}>
              Correct day
            </Button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
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
  quote: {
    ...typography.body,
    color: colors.textBody,
  },
});
