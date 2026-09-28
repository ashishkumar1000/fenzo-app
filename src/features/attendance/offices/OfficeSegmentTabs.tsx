/**
 * OfficeSegmentTabs — the All/Active/Archived segmented filter of the
 * Offices screen (user-approved sample design, 2026-09-28), with live
 * counts per segment.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';

export type OfficeSegment = 'all' | 'active' | 'archived';

const SEGMENTS: ReadonlyArray<{ key: OfficeSegment; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
];

type Props = {
  segment: OfficeSegment;
  activeCount: number;
  archivedCount: number;
  onSelect: (segment: OfficeSegment) => void;
};

export function OfficeSegmentTabs({
  segment,
  activeCount,
  archivedCount,
  onSelect,
}: Props) {
  return (
    <View
      style={styles.tabs}
      accessibilityRole="tablist"
      accessibilityLabel="Filter offices">
      {SEGMENTS.map(({ key, label }) => {
        const count =
          key === 'all'
            ? activeCount + archivedCount
            : key === 'active'
              ? activeCount
              : archivedCount;
        const selected = segment === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={`Show ${label.toLowerCase()} offices (${count})`}
            accessibilityState={{ selected }}
            onPress={() => onSelect(key)}
            style={[styles.tab, selected && styles.tabSelected]}>
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
              {label} ({count})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.lg,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  tabSelected: {
    backgroundColor: colors.surfaceCard,
  },
  tabText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextSelected: {
    color: colors.textStrong,
  },
});
