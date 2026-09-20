/**
 * SkillPicker — the New Job skill section, redesigned per the 2026-09-20
 * product-feedback mock:
 *
 * - a header row with the catalog count chip ("N available") and a
 *   "Browse all" link to the full-screen Select Skills page;
 * - a search field — non-empty, it searches the WHOLE catalog (the full
 *   screen is one tap away, so this stays a quick filter, not a duplicate);
 * - a 3-column tile grid: the first five catalog skills (seed order) plus a
 *   "+N More skills" tile that opens the same full-screen page.
 *
 * Selection styling follows the design: gray when unselected, blue when
 * selected, with a small check badge on the selected tile. Icons come from
 * the catalog itself (`skills.icon`, resolved by `SkillIcon`) — this
 * component hardcodes no skill data.
 *
 * Presentational: the parent owns the option list and the selection.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Search } from 'lucide-react-native';
import { Input } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { SkillIcon } from '../../skills';
import type { Skill } from '../../../services';

const COLUMNS = 3;
const GAP = spacing.s3;
/** Tiles on screen before the "+N more" tile takes over (2 full rows). */
const VISIBLE_TILES = 5;

type Props = {
  options: Skill[];
  value: string | null;
  onChange: (id: string) => void;
  onBrowseAll: () => void;
};

export function SkillPicker({ options, value, onChange, onBrowseAll }: Props) {
  const [rowWidth, setRowWidth] = useState(0);
  const [query, setQuery] = useState('');

  // 0 until the first layout pass — tiles render at natural width for that
  // one frame, which is invisible in practice.
  const tileWidth =
    rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;

  const trimmedQuery = query.trim().toLowerCase();

  /**
   * Empty query → the mock's default surface: the first five catalog rows
   * (seed order) plus the "+N more" tile. Non-empty → every match across the
   * whole catalog, so a search like "leak" finds rows beyond the first five
   * without leaving the screen.
   *
   * A selection made outside the first five (via "Browse all" or a search)
   * is pinned to the front of the idle grid — otherwise the chosen tile would
   * be invisible on the default surface, leaving the section with no visible
   * answer to "what skill is this job?".
   */
  const visibleSkills = useMemo(() => {
    if (trimmedQuery) {
      return options.filter(
        skill =>
          skill.name.toLowerCase().includes(trimmedQuery) ||
          skill.description.toLowerCase().includes(trimmedQuery),
      );
    }
    const base = options.slice(0, VISIBLE_TILES);
    if (value && !base.some(skill => skill.id === value)) {
      const selected = options.find(skill => skill.id === value);
      if (selected) return [selected, ...base].slice(0, VISIBLE_TILES);
    }
    return base;
  }, [options, trimmedQuery, value]);

  const moreCount = options.length - VISIBLE_TILES;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{options.length} available</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse all skills"
          onPress={onBrowseAll}
          style={styles.browseRow}>
          <Text style={styles.browseText}>Browse all</Text>
          <ChevronRight size={16} strokeWidth={2} color={colors.primary} />
        </Pressable>
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search skills"
        leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
      />

      <View
        style={styles.grid}
        onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
        {visibleSkills.map(option => {
          const isSelected = option.id === value;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.name}
              onPress={() => onChange(option.id)}
              style={[
                styles.tile,
                tileWidth ? { width: tileWidth } : null,
                isSelected && styles.tileSelected,
              ]}>
              <SkillIcon
                name={option.icon}
                size={22}
                strokeWidth={1.75}
                color={isSelected ? colors.onPrimary : colors.textStrong}
              />
              <Text
                numberOfLines={2}
                style={[styles.label, isSelected && styles.labelSelected]}>
                {option.name}
              </Text>
              {isSelected ? (
                <View style={styles.checkBadge}>
                  <Check size={12} strokeWidth={3} color={colors.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {!trimmedQuery && moreCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More skills — ${moreCount} more available`}
            onPress={onBrowseAll}
            style={[styles.tile, styles.tileMore, tileWidth ? { width: tileWidth } : null]}>
            <Text style={styles.moreCount}>+{moreCount}</Text>
            <Text numberOfLines={2} style={styles.moreLabel}>
              More skills
            </Text>
          </Pressable>
        ) : null}
      </View>

      {trimmedQuery && visibleSkills.length === 0 ? (
        <Text style={styles.noMatch}>No skills match "{query.trim()}"</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  countChip: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  countChipText: {
    ...typography.label,
    color: colors.textBody,
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  browseText: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    marginTop: spacing.s3,
  },
  tile: {
    // Comfortably past the 44px touch minimum.
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
  },
  tileMore: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.surfaceSunken,
  },
  tileSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkBadge: {
    position: 'absolute',
    top: spacing.s1 + 2,
    right: spacing.s1 + 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.label,
    color: colors.textBody,
    textAlign: 'center',
  },
  labelSelected: {
    ...typography.labelStrong,
    color: colors.onPrimary,
  },
  moreCount: {
    ...typography.heading,
    color: colors.textStrong,
  },
  moreLabel: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
  },
  noMatch: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s3,
  },
});
