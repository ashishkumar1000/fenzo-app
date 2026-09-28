/**
 * WizardFooter — the pinned action row of a wizard step (Story 15-8): the
 * primary control (Continue, or "Enable attendance" on the final step),
 * the optional secondary control (Holidays' "Skip for now"), and the gate
 * caption that explains a disabled primary in plain business English (the
 * client gates mirror the server 1:1 — never a submit-then-fail).
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  /** The explanatory caption under a disabled primary; null hides it. */
  caption: string | null;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function WizardFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  caption,
  secondaryLabel,
  onSecondary,
}: Props) {
  return (
    <View>
      <Button
        fullWidth
        size="lg"
        onPress={onPrimary}
        disabled={primaryDisabled}
        loading={primaryLoading}>
        {primaryLabel}
      </Button>
      {secondaryLabel && onSecondary ? (
        <Button
          fullWidth
          variant="secondary"
          size="lg"
          onPress={onSecondary}
          disabled={primaryLoading}
          style={styles.secondary}>
          {secondaryLabel}
        </Button>
      ) : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  secondary: {
    marginTop: spacing.s1,
  },
  caption: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.s1,
  },
});
