/**
 * EmptyState — the centered "nothing here yet" pattern: a soft icon medallion,
 * a title, a short explanation, and an optional primary CTA. Used by the
 * Technicians, Jobs and Customers zero-data screens and Home's no-jobs block.
 *
 * Purely presentational — pass the icon, copy and CTA handler from the screen.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../../theme';

export type EmptyStateProps = {
  /** Icon rendered inside the medallion (e.g. a lucide icon). */
  icon: ReactNode;
  title: string;
  description?: string;
  /** When both ctaLabel and onPressCta are set, a primary button is shown. */
  ctaLabel?: string;
  ctaIcon?: ReactNode;
  onPressCta?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaIcon = null,
  onPressCta,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.medallion}>{icon}</View>

      <Text style={styles.title}>{title}</Text>

      {description ? <Text style={styles.description}>{description}</Text> : null}

      {ctaLabel && onPressCta ? (
        <Button
          variant="primary"
          size="lg"
          onPress={onPressCta}
          leadingIcon={ctaIcon}
          style={styles.cta}>
          {ctaLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
  },
  medallion: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s5,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s2,
    maxWidth: 300,
  },
  cta: {
    marginTop: spacing.s6,
  },
});
