/**
 * WorkflowStepper — the six-step workflow as a vertical rail with a
 * connector line (spec §9), rendered inside the detail screen's Progress
 * card. Story 3.3 wires the seams: when `onAdvance` is provided the 'next'
 * row becomes tappable (a secondary target — the PRIMARY action is the
 * bottom bar's button), and `pendingStep` gives the row being advanced a
 * subtle pressed look while the request is in flight.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, spacing, touch, typography } from '../../../theme';
import { STEP_LABELS } from '../../jobDetail/eventLabels';
import type { StepView, WorkflowStep } from '../stepperModel';

type Props = {
  steps: StepView[];
  /** 3.3 — present: the 'next' row is tappable to advance (secondary to the bottom bar). */
  onAdvance?: (step: WorkflowStep) => void;
  /** 3.3 — the step whose advance request is in flight: subtle pressed state. 4.2 reuses it for the optimistic queue. */
  pendingStep?: WorkflowStep | null;
};

/** "2:14 PM" — the done-row caption format (spec §9). Unparseable input → raw. */
function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function WorkflowStepper({ steps, onAdvance, pendingStep }: Props) {
  return (
    <View>
      {steps.map((view, index) => {
        const isPending = pendingStep === view.step;
        const next = steps[index + 1];
        const label = STEP_LABELS[view.step] ?? view.step;
        const row = (
          <>
            <View style={styles.rail}>
              <Glyph view={view} pending={isPending} />
              {next ? (
                // The rail reads as one continuous line: each row draws the
                // segment down toward the next glyph, tinted green into a
                // done row (spec §9).
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: next.state === 'done' ? colors.status.done.border : colors.borderSubtle },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.labelColumn}>
              <Text style={labelStyle(view)} numberOfLines={1}>
                {label}
              </Text>
              {view.state === 'done' && view.timestamp ? (
                <Text style={styles.timestamp}>{timeLabel(view.timestamp)}</Text>
              ) : null}
            </View>
            <RightCaption view={view} pending={isPending} />
          </>
        );
        // Only the 'next' row is ever tappable — done/locked/skipped rows stay
        // display-only (no Pressable, not even a flash) whether or not the
        // advance handler is wired. EXCEPTION: a `next` photos_uploaded row is
        // display-only too — that step advances server-side when a photo is
        // confirmed (fenzit-be Story 3.6), and the backend would 422 a direct
        // photos_uploaded POST that skipped the upload, so the pill in the
        // bottom bar (and 3.4's capture) is the only path forward.
        const pressable =
          onAdvance !== undefined && view.state === 'next' && view.step !== 'photos_uploaded';
        return pressable ? (
          <Pressable
            key={view.step}
            onPress={() => onAdvance?.(view.step)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.row, (pressed || isPending) && styles.pressedRow]}>
            {row}
          </Pressable>
        ) : (
          <View style={[styles.row, isPending && styles.pressedRow]} key={view.step}>
            {row}
          </View>
        );
      })}
    </View>
  );
}

/** Step label color/weight by state: next pops, locked fades, rest muted. */
function labelStyle(view: StepView) {
  switch (view.state) {
    case 'next':
      return { ...typography.bodyStrong, color: colors.textStrong };
    case 'locked':
      return { ...typography.body, color: colors.textDisabled };
    default:
      return { ...typography.body, color: colors.textMuted };
  }
}

/** The left-rail glyph: done/next/locked/skipped/pending circles (spec §9). */
function Glyph({ view, pending }: { view: StepView; pending: boolean }) {
  if (view.state === 'done' || pending) {
    return (
      <View style={[styles.circle, styles.doneCircle, pending && styles.pendingCircle]}>
        <Check size={14} color={colors.textOnColor} strokeWidth={2.5} />
      </View>
    );
  }
  if (view.state === 'next') {
    return (
      <View style={[styles.circle, styles.nextCircle]}>
        <View style={styles.nextDot} />
      </View>
    );
  }
  if (view.state === 'skipped') {
    return <View style={[styles.circle, styles.skippedCircle]} />;
  }
  return <View style={[styles.circle, styles.lockedCircle]} />;
}

/** The right-hand caption: "Up next" / "Skipped" / "Waiting to sync". */
function RightCaption({ view, pending }: { view: StepView; pending: boolean }) {
  if (pending) {
    return <Text style={styles.pendingCaption}>Waiting to sync</Text>;
  }
  if (view.state === 'next') {
    return <Text style={styles.nextCaption}>Up next</Text>;
  }
  if (view.state === 'skipped') {
    return <Text style={styles.skippedCaption}>Skipped</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: touch.min,
    gap: spacing.s2,
  },
  // The advance-in-flight look (spec §9 "subtle pressed state while pending").
  pressedRow: {
    opacity: 0.6,
  },
  rail: {
    width: 24,
    alignItems: 'center',
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s3,
  },
  doneCircle: {
    backgroundColor: colors.status.done.solid,
  },
  // Epic 4's optimistic state borrows the amber (scheduled) family — "applied
  // here, waiting on the server" reads as scheduled-adjacent, not done.
  pendingCircle: {
    backgroundColor: colors.status.scheduled.solid,
  },
  nextCircle: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceCard,
  },
  nextDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  lockedCircle: {
    borderWidth: 2,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  skippedCircle: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  connector: {
    width: 2,
    flex: 1,
    marginTop: 2,
  },
  labelColumn: {
    flex: 1,
    marginTop: spacing.s3,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  nextCaption: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.s4,
  },
  skippedCaption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s4,
  },
  pendingCaption: {
    ...typography.caption,
    color: colors.status.scheduled.fg,
    marginTop: spacing.s4,
  },
});
