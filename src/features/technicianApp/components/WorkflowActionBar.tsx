/**
 * WorkflowActionBar — the technician job detail's bottom action bar (spec §9):
 * one absolutely-positioned sheet holding exactly ONE primary action — the
 * advance button labelled by the next step, loading while posting — or the
 * non-tappable photo-hint pill (Story 3.4 owns that action), or the static
 * "Job completed" row. Terminal/cancelled jobs render nothing (the model
 * returns `none` and the screen doesn't mount this).
 *
 * Failures of the advance call surface as an InlineError line above the bar;
 * the 422 step-race never gets here (the screen reconciles silently).
 *
 * Purely presentational: the screen owns the advance call and the error state.
 */
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CheckCircle2 } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { PHOTO_HINT_MESSAGE, type ActionBarAction } from '../workflowActionBarModel';

type Props = {
  action: Exclude<ActionBarAction, { kind: 'none' }>;
  /** True while the advance request for this step is in flight (button loading). */
  pending: boolean;
  onAdvance: (step: Extract<ActionBarAction, { kind: 'button' }>['step']) => void;
  /** InlineError line above the bar content; null hides it. */
  error: string | null;
  onDismissError: () => void;
};

export function WorkflowActionBar({ action, pending, onAdvance, error, onDismissError }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {error ? <InlineError message={error} onDismiss={onDismissError} /> : null}
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {action.kind === 'button' ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={pending}
            testID="workflow-advance-button"
            onPress={() => onAdvance(action.step)}>
            {action.label}
          </Button>
        ) : action.kind === 'photoHint' ? (
          // Photos are required before the next step unlocks; the pill is NOT
          // tappable — the Photos card above carries the capture action, and
          // the server auto-advances photos_uploaded on the first confirm.
          <View style={styles.photoHint} accessibilityLabel={PHOTO_HINT_MESSAGE}>
            <Camera size={18} color={colors.status.progress.fg} strokeWidth={2} />
            <Text style={styles.photoHintText}>{PHOTO_HINT_MESSAGE}</Text>
          </View>
        ) : (
          // The completed moment (spec §9): static, no animation loops — the
          // button disappears and the tick explains the settled state.
          <View style={styles.completed} accessibilityLabel="Job completed">
            <CheckCircle2 size={20} color={colors.status.done.solid} strokeWidth={2} />
            <Text style={styles.completedText}>Job completed</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // box-none keeps the gaps beside the pill/tick rows tap-transparent.
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.s2,
    ...shadow.sheet,
  },
  bar: {
    // SafeAreaView edges=['bottom'] adds the inset; s4 keeps the "padding
    // s4 + safe-area bottom" (spec §9) reading literal.
    paddingBottom: spacing.s4,
  },
  photoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    backgroundColor: colors.status.progress.bg,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  photoHintText: {
    ...typography.bodySm,
    color: colors.textBody,
  },
  completed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  completedText: {
    ...typography.bodyStrong,
    color: colors.status.done.fg,
  },
});