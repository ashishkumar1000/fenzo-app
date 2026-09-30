/**
 * DayDetailSheet — the FR-25 day sheet (Story 18-3 D5). Presentational over
 * the host's CURRENT row: `{ day }` re-renders live (today can change under
 * an open sheet; hosts refetch and the sheet follows) — never a mount-time
 * snapshot. Strictly read-only; 18-4 owns the writes.
 *
 * Content, top to bottom: the full StatusBadge (icon + label, soft — the
 * visually primary first block); the flag-tag row (WRAPPING — Badge
 * truncates by default and a clipped "Fake location" tag is a trust
 * failure on the audit surface); labelled value rows in the muted-label
 * strong-value anatomy (Check-in / Check-out / Worked / Office). OMISSION
 * RULE: a line with no value does not render — a no-row day opens as
 * "Not tracked" (badge only); a future leave day shows no time rows; no
 * placeholder dashes. Distance lines (D2): the wire metres are the
 * GPS-measured distance of the recorded instant — non-null → " · 42 m
 * from {officeName}", exactly 0 → " · At the office" (the FE never guesses
 * the geofence radius); a checkout carried on a later date appends
 * "(next day)".
 *
 * Corrections (latest note quoted, the expandable scrollable history) live
 * in CorrectionHistory — rendered only when the day carries one. The sheet
 * stays dismissible during reads (`dismissible={false}` is a WRITE
 * posture, 17-7 precedent) and announces on present (the OwnerLeaveScreen
 * idiom).
 */
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Badge, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import type { MonthStatusesScope } from './useMonthStatuses';
import {
  dayLabel,
  daySheetTitle,
  instantValue,
  workedValue,
} from './dayDetailModel';
import { dayFlagVisuals, DAY_STATUS_VISUALS } from './dayStatusVisual';
import { CorrectionHistory } from './CorrectionHistory';

export type DayDetailSheetProps = {
  visible: boolean;
  /** The tapped day — drives the title, the history key and the announce. */
  workDate: string | null;
  /** The host's CURRENT row for that day (null → "Not tracked" posture). */
  day: DayStatusRow | null;
  scope: MonthStatusesScope;
  onClose: () => void;
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
  onClose,
}: DayDetailSheetProps) {
  // Announce on present (the a11y floor): "Day detail, {d} {Month}".
  useEffect(() => {
    if (visible && workDate != null) {
      AccessibilityInfo.announceForAccessibility(
        `Day detail, ${daySheetTitle(workDate).split(', ')[1]}`,
      );
    }
  }, [visible, workDate]);

  const status = day?.status ?? 'not_tracked';
  const visual = DAY_STATUS_VISUALS[status];
  const flags = day ? dayFlagVisuals(day) : [];
  const StatusIcon = visual.icon;
  const latest = day?.latestCorrection;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={workDate != null ? daySheetTitle(workDate) : 'Day detail'}
      detents={['auto']}>
      <Badge
        status={visual.badgeStatus}
        icon={
          <StatusIcon
            size={12}
            color={colors.status[visual.badgeStatus].fg}
            strokeWidth={2}
          />
        }>
        {dayLabel(day)}
      </Badge>

      {day != null && flags.length > 0 ? (
        // WRAPPING row: a clipped trust flag is a trust failure.
        <View style={styles.flagRow}>
          {flags.map(flag => {
            const FlagIcon = flag.icon;
            return (
              <Badge
                key={flag.key}
                status={flag.badgeStatus}
                size="sm"
                icon={
                  <FlagIcon
                    size={12}
                    color={colors.status[flag.badgeStatus].fg}
                    strokeWidth={2}
                  />
                }>
                {flag.label}
              </Badge>
            );
          })}
        </View>
      ) : null}

      {day != null ? (
        <View style={styles.kvRows}>
          <ValueRow
            label="Check-in"
            value={instantValue(
              day.checkinAt,
              day.checkinDistanceM,
              day.officeName,
              day.workDate,
            )}
          />
          <ValueRow
            label="Check-out"
            value={instantValue(
              day.checkoutAt,
              day.checkoutDistanceM,
              day.officeName,
              day.workDate,
            )}
          />
          <ValueRow label="Worked" value={workedValue(day)} />
          <ValueRow label="Office" value={day.officeName} />
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
