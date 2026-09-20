/**
 * SectionHead — opens a form section: a hairline divider plus the eyebrow
 * section label. The divider gives the section a visible break from the one
 * above; the eyebrow is the section's only visible name, so single-field
 * sections let it carry the name and give their control no duplicate label
 * (a `Select` keeps its options-sheet title via `sheetTitle`; an `Input`
 * carries `accessibilityLabel`). Multi-field sections keep their per-field
 * labels — the eyebrow names the group (e.g. "Date & time" over Date/Time).
 */
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { Eyebrow } from './Eyebrow';

export type SectionHeadProps = {
  title: string;
};

export function SectionHead({ title }: SectionHeadProps) {
  return (
    <View style={styles.wrap}>
      <View testID="section-divider" style={styles.divider} />
      <Eyebrow>{title}</Eyebrow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.s2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
});