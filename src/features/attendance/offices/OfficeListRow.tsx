/**
 * OfficeListRow — one office in the Offices list (Story 15-4, reshaped to
 * the user-approved sample design 2026-09-28): identity header (icon tile,
 * name + status pill, chevron) over a hairline-separated facts row
 * (geofence radius · shift hours).
 *
 * Archived rows render read-only (muted, no press, neutral pill) — they are
 * grouped behind the screen's "Archived" disclosure/tab and can never be
 * edited or re-archived (15-3 contract: archived offices PATCH to 404,
 * never unarchive).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, ChevronRight, Clock, LocateFixed } from 'lucide-react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
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

/** "11h full · 5.5h half" — JS number formatting already drops a trailing .0. */
export function officeHoursSummary(office: Office): string | null {
  if (!office.rule) return null;
  return `${office.rule.fullDayHours}h full · ${office.rule.halfDayHours}h half`;
}

/** "12.938° N, 77.690° E" — 3 decimals, hemisphere suffixes. */
export function officeCoordinates(office: Office): string {
  const lat = `${Math.abs(office.latitude).toFixed(3)}° ${office.latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(office.longitude).toFixed(3)}° ${office.longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

export default function OfficeListRow({ office, onPress }: Props) {
  const archived = office.archivedAt !== null;
  const hours = officeHoursSummary(office);
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
        <View style={styles.header}>
          <View style={styles.iconTile}>
            <Building2 size={20} color={colors.primary} strokeWidth={1.8} />
          </View>
          <View style={styles.texts}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, archived && styles.textArchived]} numberOfLines={1}>
                {office.name}
              </Text>
              <Badge status={archived ? 'neutral' : 'done'} tone="soft" size="sm" dot>
                {archived ? 'Archived' : 'Active'}
              </Badge>
            </View>
            {/* Coordinates double as the location line (offices carry no
                free-text address). */}
            <Text style={[styles.coords, archived && styles.textArchived]} numberOfLines={1}>
              {officeCoordinates(office)}
            </Text>
          </View>
          {archived ? null : (
            <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
          )}
        </View>

        <View style={styles.facts}>
          <View style={styles.fact}>
            <LocateFixed size={14} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.factStrong, archived && styles.textArchived]}>
              {office.radiusM} m geofence
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.fact}>
            <Clock size={14} color={colors.textStrong} strokeWidth={2} />
            <Text style={[styles.factStrong, archived && styles.textArchived]} numberOfLines={1}>
              {officeTimingSummary(office)}
            </Text>
          </View>
          {office.rule ? (
            <>
              <View style={styles.divider} />
              <View style={styles.cutoffChip}>
                <Text style={styles.cutoffText}>{office.rule.lateCutoffMinutes}m cutoff</Text>
              </View>
            </>
          ) : null}
        </View>

        {office.rule ? (
          <View style={styles.extraRow}>
            <View style={styles.hoursChip}>
              <Text style={styles.hoursText}>{hours}</Text>
            </View>
          </View>
        ) : null}

        {office.rule ? (
          <Text style={[styles.validFrom, archived && styles.textArchived]}>
            Valid from {formatLongDate(office.rule.validFrom)}
          </Text>
        ) : null}
        {archived ? (
          <Text style={styles.validFrom}>
            Archived {formatLongDate((office.archivedAt ?? '').slice(0, 10))}
          </Text>
        ) : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardArchived: {
    opacity: 0.7,
  },
  row: {
    padding: spacing.s4,
    borderRadius: radius.md,
    gap: spacing.s3,
  },
  rowPressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    ...typography.heading,
    color: colors.textStrong,
  },
  coords: {
    ...typography.caption,
    color: colors.textMuted,
  },
  facts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s2,
    backgroundColor: colors.surfacePage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    flexShrink: 1,
  },
  factStrong: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textStrong,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: colors.borderDefault,
  },
  cutoffChip: {
    backgroundColor: colors.status.scheduled.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  cutoffText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.status.scheduled.solid,
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hoursChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  hoursText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textStrong,
  },
  validFrom: {
    ...typography.caption,
    color: colors.textMuted,
  },
  textArchived: {
    color: colors.textMuted,
  },
});
