/**
 * EmptyState — the centered "nothing here yet" pattern: a soft icon medallion,
 * a title, a short explanation, and an optional primary CTA. Used by the
 * Technicians, Jobs and Customers zero-data screens and Home's no-jobs block.
 *
 * Purely presentational — pass the icon, copy and CTA handler from the screen.
 *
 * Additive props (story 20-3): `medallionShape` and `badge` restyle the
 * medallion, `ctaShape` renders the CTA as the outlined pill. Every default
 * preserves the original render exactly — the other consumers never pass
 * them.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { colors, radius, shadow, spacing, typography } from '../../theme';

export type EmptyStateProps = {
  /** Icon rendered inside the medallion (e.g. a lucide icon). */
  icon: ReactNode;
  title: string;
  description?: string;
  /** When both ctaLabel and onPressCta are set, a button is shown. */
  ctaLabel?: string;
  ctaIcon?: ReactNode;
  onPressCta?: () => void;
  /** CTA emphasis — secondary suits "Go back"-style exits, primary invites. */
  ctaVariant?: 'primary' | 'secondary';
  /** Medallion corner: the circle default, or the rounded-square chip. */
  medallionShape?: 'circle' | 'square';
  /** Small overlay node pinned to the medallion's bottom-right corner. */
  badge?: ReactNode;
  /** CTA silhouette: the DS button, or the outlined pill with brand ink. */
  ctaShape?: 'default' | 'pill';
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaIcon = null,
  onPressCta,
  ctaVariant = 'primary',
  medallionShape = 'circle',
  badge = null,
  ctaShape = 'default',
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      <View
        style={[
          styles.medallion,
          medallionShape === 'square' && styles.medallionSquare,
        ]}>
        {icon}
        {badge != null ? <View style={styles.badge}>{badge}</View> : null}
      </View>

      <Text style={styles.title}>{title}</Text>

      {description ? <Text style={styles.description}>{description}</Text> : null}

      {ctaLabel && onPressCta ? (
        ctaShape === 'pill' ? (
          // The pill: ghost surface (brand ink text/icon) over a bordered
          // white wrapper — Button's `style` lands on that wrapper, which is
          // what draws the capsule.
          <Button
            variant="ghost"
            size="lg"
            shape="pill"
            onPress={onPressCta}
            leadingIcon={ctaIcon}
            style={styles.pillCta}>
            {ctaLabel}
          </Button>
        ) : (
          <Button
            variant={ctaVariant}
            size="lg"
            onPress={onPressCta}
            leadingIcon={ctaIcon}
            style={styles.cta}>
            {ctaLabel}
          </Button>
        )
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
  medallionSquare: {
    borderRadius: radius['2xl'],
  },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
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
    alignSelf: 'center',
    marginTop: spacing.s6,
  },
  pillCta: {
    alignSelf: 'center',
    marginTop: spacing.s6,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.xs,
  },
});
