/**
 * SectionCard — a Card with a section title, the container for the blocks of
 * a detail screen (Customer, Technician, Photos & signature, Activity).
 * Shared by the owner detail (Story 1.2) and the technician detail (3.2);
 * dumb by design: props in, UI out.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, fontSize, leading, spacing, typography } from '../../../theme';

type Props = {
  title: string;
  children?: ReactNode;
};

export function SectionCard({ title, children }: Props) {
  return (
    <Card padding="md">
      <Text style={styles.title}>{title}</Text>
      {/* A View keeps the title's margin authoritative even when a child has
          none of its own — children are simply laid out below it. */}
      <View>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `heading` role @16 (spec §4): the heading role's weight/family, size
  // stepped down for an in-card section title.
  title: {
    ...typography.heading,
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * leading.snug),
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
});