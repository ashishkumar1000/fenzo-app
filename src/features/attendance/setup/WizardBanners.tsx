/**
 * WizardBanners — the banner slot between a wizard step's indicator and
 * its body (Story 15-8). Three kinds, in order:
 *
 *  - the marker-PATCH retry banner (AC-4: a failed advance shows an inline
 *    retry on the step; the wizard does not advance and nothing entered is
 *    lost — Retry re-PATCHes the same marker);
 *  - the completion-failure banner (a rejected "Enable attendance" — the
 *    footer button itself is the retry);
 *  - the per-surface STALE banner (`error && hasLoaded` per the useOffices
 *    tri-state contract): only the surfaces the current step actually
 *    reads announce their refetch failure, over the still-rendered rows.
 */
import { View, StyleSheet } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { spacing } from '../../../theme';
import type { ApiError, SetupStep } from '../../../services';

/** One data surface's stale-banner inputs. */
export interface WizardSurfaceState {
  hasError: boolean;
  hasLoaded: boolean;
  message: string;
}

type Props = {
  step: SetupStep;
  advanceError: ApiError | null;
  onRetryAdvance: () => void;
  isAdvancing: boolean;
  completionError: ApiError | null;
  surfaces: {
    offices: WizardSurfaceState;
    weeklyOff: WizardSurfaceState;
    holidays: WizardSurfaceState;
    roster: WizardSurfaceState;
  };
};

/** Which surfaces each step's summary reads — a failed refetch only
 *  announces itself where its rows are on screen. */
const STEP_SURFACES: Record<SetupStep, Array<'offices' | 'weeklyOff' | 'holidays' | 'roster'>> = {
  offices: ['offices'],
  timings: ['offices'],
  weekly_off: ['weeklyOff'],
  holidays: ['holidays'],
  employees: ['offices', 'roster'],
};

export function WizardBanners({
  step,
  advanceError,
  onRetryAdvance,
  isAdvancing,
  completionError,
  surfaces,
}: Props) {
  return (
    <View style={styles.stack}>
      {advanceError ? (
        <View style={styles.stack}>
          <InlineError message="Couldn't save your progress. Check your connection and try again." />
          <Button
            variant="secondary"
            size="sm"
            onPress={onRetryAdvance}
            disabled={isAdvancing}>
            Retry
          </Button>
        </View>
      ) : null}
      {completionError ? (
        <InlineError message="Attendance couldn't be enabled yet. Check the requirements below and try again." />
      ) : null}
      {STEP_SURFACES[step].map((key) => {
        const surface = surfaces[key];
        if (!surface.hasError || !surface.hasLoaded) return null;
        return <InlineError key={key} message={surface.message} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
});
