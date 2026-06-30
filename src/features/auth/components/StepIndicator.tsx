/**
 * StepIndicator — the connected 1—2—3 progress dots above the setup card.
 * Completed and current steps fill primary-blue; the connector to a reached
 * step also fills. Purely presentational, driven by `current` (1-based).
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, weight } from '../../../theme';

type Props = {
  /** 1-based index of the active step. */
  current: number;
  /** Total number of steps. */
  total: number;
};

const SIZE = 36;

export function StepIndicator({ current, total }: Props) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <View style={styles.row} accessibilityLabel={`Step ${current} of ${total}`}>
      {steps.map((step, i) => {
        const reached = step <= current;
        const connectorActive = step < current;
        return (
          <View key={step} style={styles.group}>
            {i > 0 ? (
              <View
                style={[
                  styles.connector,
                  connectorActive ? styles.connectorActive : null,
                ]}
              />
            ) : null}
            <View style={[styles.dot, reached ? styles.dotActive : null]}>
              <Text style={[styles.num, reached ? styles.numActive : null]}>
                {step}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connector: {
    width: 56,
    height: 2,
    backgroundColor: colors.borderSubtle,
  },
  connectorActive: {
    backgroundColor: colors.primary,
  },
  dot: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  num: {
    fontSize: fontSize.sm,
    fontWeight: weight.bold,
    color: colors.textMuted,
  },
  numActive: {
    color: colors.onPrimary,
  },
});
