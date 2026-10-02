/**
 * PunchStatusCard — the tinted status card beneath the PunchButton (the
 * approved mockup): a solid icon well, a bold title, a solid chip on the
 * right and a body of emphasis segments. Tone comes from the model and
 * maps onto the existing status tokens (done=green, progress=blue,
 * cancelled=red, scheduled=amber, neutral=gray) — no new card palette.
 *
 * Purely presentational; the copy lives in the model's frozen table.
 */
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors, fontSize, radius, spacing } from '../../../theme';
import type {
  PunchCardTone,
  PunchStatusCardModel,
} from './attendanceTodayModel';

const TONES: Record<
  PunchCardTone,
  { bg: string; border: string; fg: string; solid: string }
> = {
  done: {
    bg: colors.status.done.bg,
    border: colors.status.done.border,
    fg: colors.status.done.fg,
    solid: colors.status.done.solid,
  },
  progress: {
    bg: colors.status.progress.bg,
    border: colors.status.progress.border,
    fg: colors.status.progress.fg,
    solid: colors.status.progress.solid,
  },
  cancelled: {
    bg: colors.status.cancelled.bg,
    border: colors.status.cancelled.border,
    fg: colors.status.cancelled.fg,
    solid: colors.status.cancelled.solid,
  },
  scheduled: {
    bg: colors.status.scheduled.bg,
    border: colors.status.scheduled.border,
    fg: colors.status.scheduled.fg,
    solid: colors.status.scheduled.solid,
  },
  neutral: {
    bg: colors.status.neutral.bg,
    border: colors.status.neutral.border,
    fg: colors.status.neutral.fg,
    solid: colors.status.neutral.solid,
  },
};

export function PunchStatusCard({ model }: { model: PunchStatusCardModel }) {
  const t = TONES[model.tone];
  return (
    <View
      style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityLabel={model.announce}
      accessibilityRole="text">
      <View style={[styles.iconWell, { backgroundColor: t.solid }]}>
        <MapPin size={14} color={colors.surfaceCard} strokeWidth={2.2} />
      </View>
      <View style={styles.body}>
        <View style={styles.headRow}>
          {model.title ? (
            <Text style={[styles.title, { color: t.fg }]} numberOfLines={1}>
              {model.title}
            </Text>
          ) : null}
          {model.chip ? (
            <View style={[styles.chip, { backgroundColor: t.solid }]}>
              <Text style={styles.chipLabel}>{model.chip}</Text>
            </View>
          ) : null}
        </View>
        {model.segments.length > 0 ? (
          <Text style={styles.bodyText} maxFontSizeMultiplier={1.6}>
            {model.segments.map((s, i) => (
              <Text
                key={i}
                style={
                  s.emphasis === 'danger'
                    ? styles.danger
                    : s.emphasis === 'strong'
                      ? styles.strong
                      : undefined
                }>
                {s.text}
              </Text>
            ))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    flexShrink: 1,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.surfaceCard,
  },
  bodyText: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.4),
    color: colors.textBody,
  },
  strong: {
    fontWeight: '700',
    color: colors.textStrong,
  },
  danger: {
    fontWeight: '700',
    color: colors.status.cancelled.solid,
  },
});
