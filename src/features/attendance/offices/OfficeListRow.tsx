/**
 * OfficeListRow — one office in the Offices list (Story 15-4).
 *
 * Shows name, geofence radius and today's timing summary. Archived rows
 * render read-only (muted, no press) — they are grouped behind the screen's
 * "Archived" disclosure and can never be edited or re-archived (15-3
 * contract: archived offices PATCH to 404, never unarchive).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { Office } from '../../../types/office';

type Props = {
  office: Office;
  /** Archived rows are display-only. */
  onPress?: () => void;
};

/** Today's timing summary — "09:00 – 18:00", or the honest gap. */
export function officeTimingSummary(office: Office): string {
  if (!office.rule) return 'Timing not set';
  return `${office.rule.startTime} – ${office.rule.endTime}`;
}

export default function OfficeListRow({ office, onPress }: Props) {
  const archived = office.archivedAt !== null;
  return (
    <Card padding="none" style={archived ? styles.cardArchived : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Office ${office.name}`}
        accessibilityState={archived ? { disabled: true } : undefined}
        onPress={onPress}
        disabled={archived}
        style={({ pressed }) => [
          styles.row,
          pressed && !archived && styles.rowPressed,
        ]}>
        <View style={styles.texts}>
          <Text style={[styles.name, archived && styles.nameArchived]} numberOfLines={1}>
            {office.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {office.radiusM} m geofence · {officeTimingSummary(office)}
          </Text>
        </View>
        {archived ? (
          <Text style={styles.archivedTag}>Archived</Text>
        ) : (
          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardArchived: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  rowPressed: {
    opacity: 0.85,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.heading,
    color: colors.textStrong,
  },
  nameArchived: {
    color: colors.textMuted,
  },
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  archivedTag: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
