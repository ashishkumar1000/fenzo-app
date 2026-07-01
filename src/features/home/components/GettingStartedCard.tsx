/**
 * GettingStartedCard — first-run checklist shown on Home until the owner has
 * set up their team and booked their first job. Steps light up in sequence:
 *
 *   1. Business account created   — always done (they finished auth to get here)
 *   2. Add your first technician  — active until ≥1 technician exists
 *   3. Create your first job      — locked until a technician exists, then active
 *
 * Driven by the live `hasTechnicians` / `hasJobs` flags so it updates the
 * moment the owner adds a technician.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, HardHat, Lock, Briefcase } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type StepState = 'done' | 'active' | 'locked';

type Props = {
  hasTechnicians: boolean;
  hasJobs: boolean;
  onAddTechnician: () => void;
  onCreateJob: () => void;
};

export function GettingStartedCard({
  hasTechnicians,
  hasJobs,
  onAddTechnician,
  onCreateJob,
}: Props) {
  const technicianState: StepState = hasTechnicians ? 'done' : 'active';
  const jobState: StepState = hasJobs ? 'done' : hasTechnicians ? 'active' : 'locked';

  const doneCount = [true, hasTechnicians, hasJobs].filter(Boolean).length;

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Get set up</Text>
        <Text style={styles.progress}>{doneCount} of 3</Text>
      </View>

      <View style={styles.steps}>
        <Step
          icon={<Check size={16} color={colors.status.done.fg} strokeWidth={3} />}
          label="Business account created"
          state="done"
        />
        <Step
          icon={<HardHat size={18} color={colors.primary} strokeWidth={2} />}
          label="Add your first technician"
          state={technicianState}
          onPress={onAddTechnician}
        />
        <Step
          icon={<Briefcase size={18} color={colors.primary} strokeWidth={2} />}
          label="Create your first job"
          state={jobState}
          onPress={onCreateJob}
        />
      </View>
    </Card>
  );
}

type StepProps = {
  icon: ReactNode;
  label: string;
  state: StepState;
  onPress?: () => void;
};

function Step({ icon, label, state, onPress }: StepProps) {
  const isDone = state === 'done';
  const isLocked = state === 'locked';
  const tappable = state === 'active' && Boolean(onPress);

  return (
    <Card
      padding="sm"
      elevated={false}
      interactive={tappable}
      onPress={tappable ? onPress : undefined}
      style={[
        styles.step,
        state === 'active' ? styles.stepActive : null,
        isLocked ? styles.stepLocked : null,
      ]}>
      <View
        style={[
          styles.stepIcon,
          isDone ? styles.stepIconDone : null,
          state === 'active' ? styles.stepIconActive : null,
        ]}>
        {isLocked ? <Lock size={16} color={colors.textDisabled} strokeWidth={2} /> : icon}
      </View>

      <Text
        style={[
          styles.stepLabel,
          isDone ? styles.stepLabelDone : null,
          isLocked ? styles.stepLabelLocked : null,
        ]}>
        {label}
      </Text>

      {tappable ? (
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.heading,
    fontSize: 18,
    color: colors.textStrong,
  },
  progress: {
    ...typography.label,
    color: colors.textMuted,
  },
  steps: {
    gap: spacing.s2,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 0,
  },
  stepActive: {
    backgroundColor: colors.primarySoft,
  },
  stepLocked: {
    opacity: 0.6,
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  stepIconDone: {
    backgroundColor: colors.status.done.bg,
  },
  stepIconActive: {
    backgroundColor: colors.surfaceCard,
  },
  stepLabel: {
    ...typography.body,
    fontSize: 15,
    color: colors.textStrong,
    flex: 1,
  },
  stepLabelDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  stepLabelLocked: {
    color: colors.textMuted,
  },
});
