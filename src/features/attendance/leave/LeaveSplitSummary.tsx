/**
 * LeaveSplitSummary — the split preview's shared hero (Story 17-7, spec
 * D2/D6): two icon+text lines in the list-row typography, directly under
 * the sheet header — no box/card/tint (DESIGN.md: "no new visual
 * element"). The stays line leads (`CheckCircle2`, done-green), the action
 * line follows (`Undo2`/`CalendarX`, danger glyph, ink text). All copy is
 * model-emitted (`buildLeaveSplitCopy`); the two lines read as ONE
 * accessible composite (the model's label — children hidden from assistive
 * tech so VoiceOver reads one sentence), announced politely when the
 * preview arrives (the async live region — a screen-reader user must not
 * hear a spinner and silence).
 *
 * Also hosts 17-6's per-day chip block, split-only: rendered when
 * `request.dates` holds days neither hero group covers (a check-in
 * auto-cancelled day inside the span must be visible at the decision
 * moment — D2).
 */
import { StyleSheet, Text, View } from 'react-native';
import { CalendarX, CheckCircle2, Undo2 } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeaveActionPreview } from '../../../services/resources/attendanceLeave';
import { LeaveStatusBadge } from './LeaveRequestRow';
import { formatLeaveDate } from './leaveStatusModel';
import {
  buildLeaveSplitCopy,
  leavePerDayBlockDates,
} from './leaveSplitModel';

export function LeaveSplitSummary(input: {
  preview: LeaveActionPreview;
  /** Today's `YYYY-MM-DD` (the house `istTodayDate()`) — gates the
   *  "(including today)" suffix. */
  today: string;
}) {
  const { preview, today } = input;
  const copy = buildLeaveSplitCopy(preview, today);
  // The degenerate shapes never reach here — the stages replace the hero
  // with their notices (D2).
  if (copy.shape === 'nothing-actionable' || copy.shape === 'already-handled') {
    return null;
  }
  const perDay = leavePerDayBlockDates(preview);
  const ActionIcon = preview.action === 'revoke' ? Undo2 : CalendarX;

  return (
    <View>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={copy.compositeLabel}
        accessibilityLiveRegion="polite"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {copy.staysLine !== null ? (
          <View style={styles.line}>
            <CheckCircle2
              size={16}
              color={colors.status.done.fg}
              strokeWidth={2}
            />
            <Text style={styles.lineText}>{copy.staysLine}</Text>
          </View>
        ) : null}
        <View style={styles.line}>
          <ActionIcon size={16} color={colors.danger} strokeWidth={2} />
          <Text style={styles.lineText}>{copy.actionLine}</Text>
        </View>
      </View>

      {perDay.length > 0 ? (
        <View style={styles.splitBlock}>
          {perDay.map(day => (
            <View key={day.date} style={styles.splitRow}>
              <Text style={styles.splitDate}>{formatLeaveDate(day.date)}</Text>
              <LeaveStatusBadge status={day.state} size="sm" />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 28,
  },
  lineText: {
    ...typography.body,
    color: colors.textStrong,
    flexShrink: 1,
  },
  // 17-6's per-day block, verbatim.
  splitBlock: {
    gap: spacing.s2,
    backgroundColor: colors.surfacePage,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginTop: spacing.s2,
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
});
