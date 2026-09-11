import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Svg, { Line } from 'react-native-svg';
import { colors, spacing } from '../../../theme';
import type { WorkflowTemplateStep } from '../../../services';

type Props = {
  steps: WorkflowTemplateStep[];
  currentStepIndex: number | null;
  jobStatus: string;
};

function getStepStatus(
  stepIndex: number,
  currentStepIndex: number | null,
  jobStatus: string,
): 'completed' | 'in-progress' | 'pending' {
  if (jobStatus === 'completed') {
    return 'completed';
  }
  if (jobStatus === 'cancelled') {
    return 'pending';
  }
  if (currentStepIndex === null) {
    return 'pending';
  }
  if (stepIndex < currentStepIndex) {
    return 'completed';
  }
  if (stepIndex === currentStepIndex) {
    return 'in-progress';
  }
  return 'pending';
}

function getStatusLabel(steps: WorkflowTemplateStep[], currentStepIndex: number | null, jobStatus: string): string {
  if (jobStatus === 'completed') {
    return `All ${steps.length} steps finished`;
  }
  if (jobStatus === 'cancelled') {
    return 'Job cancelled';
  }
  if (currentStepIndex === null) {
    return 'Not started';
  }
  return `Step ${currentStepIndex + 1} of ${steps.length}`;
}

function getBadgeColor(jobStatus: string, colors: any): { bg: string; fg: string } {
  if (jobStatus === 'completed') {
    return { bg: colors.status.done.bg, fg: colors.status.done.solid };
  }
  if (jobStatus === 'cancelled') {
    return { bg: colors.status.cancelled.bg, fg: colors.status.cancelled.solid };
  }
  return { bg: colors.status.progress.bg, fg: colors.status.progress.solid };
}

export function WorkflowStatusCard({ steps, currentStepIndex, jobStatus }: Props) {
  const statusLabel = getStatusLabel(steps, currentStepIndex, jobStatus);
  const badgeColors = getBadgeColor(jobStatus, colors);
  const completedCount = steps.findIndex((_, index) => {
    const status = getStepStatus(index, currentStepIndex, jobStatus);
    return status === 'pending';
  });
  const connectorProgress = completedCount < 0 ? 100 : steps.length <= 1 ? 0 : (completedCount / (steps.length - 1)) * 100;

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle }]}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textMuted }]}>WORKFLOW STATUS</Text>
        <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.badgeText, { color: badgeColors.fg }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Progress Stepper Section */}
      <View style={styles.flowContainer}>
        {/* SVG lines connecting circles */}
        <Svg style={styles.svg} pointerEvents="none">
          {steps.map((_, index) => {
            if (index === steps.length - 1) return null;

            const currentStatus = getStepStatus(index, currentStepIndex, jobStatus);
            const lineColor =
              currentStatus === 'completed' || currentStatus === 'in-progress'
                ? colors.status.done.solid
                : colors.borderSubtle;

            // Calculate positions for evenly distributed circles
            const stepCount = steps.length;
            const x1 = (index * 100) / (stepCount - 1) + '%';
            const x2 = ((index + 1) * 100) / (stepCount - 1) + '%';
            const y = 30;

            return (
              <Line
                key={`line-${index}`}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={lineColor}
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
        </Svg>

        {/* Step circles container */}
        <View style={styles.stepsContainer}>
          {steps.map((step, index) => {
            const status = getStepStatus(index, currentStepIndex, jobStatus);
            const isCompleted = status === 'completed';
            const isInProgress = status === 'in-progress';

            return (
              <View key={step.key} style={styles.stepWrapper}>
                {/* Glow ring for in-progress step */}
                {isInProgress && <View style={styles.glowRing} />}

                {/* Step circle */}
                <View
                  style={[
                    styles.stepCircle,
                    {
                      backgroundColor: isCompleted || isInProgress ? colors.status.done.solid : colors.status.neutral.bg,
                    },
                  ]}
                >
                  {isCompleted ? (
                    <Check size={14} color={colors.surfaceCard} strokeWidth={3} />
                  ) : (
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor: isCompleted || isInProgress ? colors.surfaceCard : colors.textDisabled,
                        },
                      ]}
                    />
                  )}
                </View>

                {/* Step label */}
                <Text
                  style={[
                    styles.stepLabel,
                    {
                      color: isCompleted ? colors.status.done.solid : colors.textBody,
                      fontWeight: isCompleted ? '700' : '600',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: spacing.s4,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  flowContainer: {
    position: 'relative',
    paddingTop: 16,
    paddingBottom: 16,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
    zIndex: 1,
  },
  stepWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  glowRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    top: -4,
    backgroundColor: 'rgba(6, 149, 111, 0.2)',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepLabel: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
  },
});
