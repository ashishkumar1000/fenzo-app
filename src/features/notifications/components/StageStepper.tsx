/**
 * StageStepper — the compact horizontal timeline on a notification card
 * (Story 3.4 redesign): four display stages ("On my way → Arrived → In
 * progress → Completed"), each a glyph + label + relative time, derived from
 * the job's own notifications by `notificationCardModel.ts`.
 *
 * Visual language follows the technician app's vertical `WorkflowStepper`
 * (done = solid check, current = outlined ring + dot, pending = muted ring)
 * condensed to a horizontal grid — the vertical rail doesn't fit a card.
 * The current stage takes the card banner's status color (`currentColor`)
 * rather than a fixed primary, so the timeline and the status banner always
 * read as one state.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, spacing, typography } from '../../../theme';
import { relativeTime } from '../../../utils';
import type { CardStage } from '../notificationCardModel';

export function StageStepper({
  stages,
  currentColor,
  isCompleted,
}: {
  stages: CardStage[];
  /** The card banner's status fg color — the current stage renders in it. */
  currentColor: string;
  /**
   * Whether the job reached a TERMINAL step (`card.isCompleted`) — the
   * Completed stage is NOT done just because it is current: photos/signature
   * fold into it mid-completion-flow, and only a terminal step finishes the
   * job (see `notificationCardModel.ts` TERMINAL_STEPS).
   */
  isCompleted: boolean;
}) {
  return (
    <View style={styles.grid}>
      {stages.map((stage, index) => {
        // A job that actually finished renders its final stage in the green
        // done family even while it is the current stage. Mid-completion-flow
        // (photos/signature — current but not terminal) keeps the ring.
        const isFinalCurrent =
          stage.state === 'current' && stage.key === 'completed' && isCompleted;
        return (
          <View key={stage.key} style={styles.column}>
            <Glyph
              stage={stage}
              isFinalCurrent={isFinalCurrent}
              currentColor={currentColor}
              number={index + 1}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                stage.state === 'current' ? [styles.labelCurrent, { color: currentColor }] : null,
              ]}>
              {stage.label}
            </Text>
            <Text style={styles.time} numberOfLines={1}>
              {stage.reachedAt === null ? 'Pending' : relativeTime(stage.reachedAt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * done = solid check · current = outlined ring + dot · pending = muted ring
 * with the stage's ordinal number (per the redesign reference).
 */
function Glyph({
  stage,
  isFinalCurrent,
  currentColor,
  number,
}: {
  stage: CardStage;
  isFinalCurrent: boolean;
  currentColor: string;
  number: number;
}) {
  if (stage.state === 'done' || isFinalCurrent) {
    return (
      <View style={[styles.circle, styles.doneCircle]}>
        <Check size={13} color={colors.status.done.fg} strokeWidth={2.5} />
      </View>
    );
  }
  if (stage.state === 'current') {
    return (
      <View style={[styles.circle, styles.currentCircle, { borderColor: currentColor }]}>
        <View style={[styles.currentDot, { backgroundColor: currentColor }]} />
      </View>
    );
  }
  return (
    <View style={[styles.circle, styles.pendingCircle]}>
      <Text style={styles.pendingNumber}>{number}</Text>
    </View>
  );
}

const CIRCLE = 24;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s1,
  },
  doneCircle: {
    backgroundColor: colors.status.done.bg,
  },
  currentCircle: {
    borderWidth: 2,
    backgroundColor: colors.surfaceCard,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pendingCircle: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  pendingNumber: {
    ...typography.caption,
    color: colors.textDisabled,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  labelCurrent: {
    fontWeight: '700',
  },
  time: {
    ...typography.caption,
    color: colors.textDisabled,
  },
});
