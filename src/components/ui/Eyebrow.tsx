/**
 * Eyebrow — the tiny letter-spaced caps section label: the design system's
 * one allowed caps use. Renders `typography.eyebrow` (captionStrong plus the
 * `caps` tracking) in muted ink, with `accessibilityRole="header"` so screen
 * readers can jump between the sections it names.
 *
 * `SectionHead` (divider + eyebrow) is the form-section application of this;
 * use `Eyebrow` bare where a divider is not wanted (list section headers).
 */
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, typography } from '../../theme';

export type EyebrowProps = {
  children: string;
  style?: StyleProp<TextStyle>;
};

export function Eyebrow({ children, style }: EyebrowProps) {
  return (
    <Text accessibilityRole="header" style={[styles.eyebrow, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...typography.eyebrow,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});