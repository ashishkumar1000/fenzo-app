/**
 * CustomerPicker — the New Job customer section, mirroring the SkillPicker
 * pattern (product feedback 2026-09-20): a header row — count chip ("N
 * customers") and a "Browse all" link to the full-screen Select Customers
 * page; a search field that filters the whole customer store client-side; a
 * 3-column tile grid.
 *
 * The idle grid shows the five most recently served customers (by
 * `lastJobDate`, name as the tiebreak — `sortCustomersByRecency`) plus a
 * "+N More customers" tile that opens the same full-screen page. Five, not
 * three, so the grid is always two complete rows — the dangling "+N more"
 * tile a 3-tile grid produced is exactly what this layout avoids. A selection
 * made outside those five (via "Browse all" or a search) is pinned to the
 * front — otherwise the chosen tile would be invisible on the default
 * surface, leaving the section with no visible answer to "who is this job
 * for?".
 *
 * Selected styling follows the skill tiles: light primary tint with a
 * primary border, primary label, and a solid primary check badge. The
 * customer's avatar (initials on a name-derived tint, via the DS `Avatar`)
 * keeps its own tint when selected — the badge and border already mark the
 * state, and the tint is the customer's stable identity, not the
 * selection's.
 *
 * The section name ("Customer") lives in the NewJobScreen `SectionHead`
 * above this component — the header carries only the count chip and Browse
 * all, so the name is never doubled.
 *
 * Presentational: the parent owns the option list and the selection.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Search } from 'lucide-react-native';
import { Avatar, Input } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { filterCustomers, sortCustomersByRecency } from '../../customers';
import type { Customer } from '../../customers';

const COLUMNS = 3;
const GAP = spacing.s3;
/**
 * Tiles on screen before the "+N more" tile takes over — 5, exactly like the
 * SkillPicker, so the grid is always 2 complete rows (COLUMNS divides
 * VISIBLE_TILES + 1); any other count leaves the "+N more" tile dangling on
 * a row of its own.
 */
const VISIBLE_TILES = 5;

type Props = {
  options: Customer[];
  value: string | null;
  onChange: (id: string) => void;
  onBrowseAll: () => void;
};

export function CustomerPicker({ options, value, onChange, onBrowseAll }: Props) {
  const [rowWidth, setRowWidth] = useState(0);
  const [query, setQuery] = useState('');

  // 0 until the first layout pass — tiles render at natural width for that
  // one frame, which is invisible in practice.
  const tileWidth =
    rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;

  const trimmedQuery = query.trim();

  /**
   * Empty query → the default surface: the five most recently served
   * customers plus the "+N more" tile. Non-empty → every match across the
   * whole store (same name-or-phone semantics as the Customers tab), so a
   * search like "pri" finds rows beyond the first five without leaving
   * the screen.
   */
  const visibleCustomers = useMemo(() => {
    if (trimmedQuery) return filterCustomers(options, trimmedQuery);
    const base = sortCustomersByRecency(options).slice(0, VISIBLE_TILES);
    if (value && !base.some(customer => customer.id === value)) {
      const selected = options.find(customer => customer.id === value);
      if (selected) return [selected, ...base].slice(0, VISIBLE_TILES);
    }
    return base;
  }, [options, trimmedQuery, value]);

  const moreCount = options.length - VISIBLE_TILES;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>
            {options.length} {options.length === 1 ? 'customer' : 'customers'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse all customers"
          onPress={onBrowseAll}
          style={styles.browseRow}>
          <Text style={styles.browseText}>Browse all</Text>
          <ChevronRight size={16} strokeWidth={2} color={colors.primary} />
        </Pressable>
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search customers"
        accessibilityLabel="Search customers"
        leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
      />

      <View
        style={styles.grid}
        onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
        {visibleCustomers.map(customer => {
          const isSelected = customer.id === value;

          return (
            <Pressable
              key={customer.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={customer.name}
              onPress={() => onChange(customer.id)}
              style={[
                styles.tile,
                tileWidth ? { width: tileWidth } : null,
                isSelected && styles.tileSelected,
              ]}>
              <Avatar name={customer.name} size="md" />
              <Text
                numberOfLines={2}
                style={[styles.label, isSelected && styles.labelSelected]}>
                {customer.name}
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
            accessibilityLabel={`More customers — ${moreCount} more available`}
            onPress={onBrowseAll}
            style={[styles.tile, styles.tileMore, tileWidth ? { width: tileWidth } : null]}>
            <Text style={styles.moreCount}>+{moreCount}</Text>
            <Text numberOfLines={2} style={styles.moreLabel}>
              More customers
            </Text>
          </Pressable>
        ) : null}
      </View>

      {trimmedQuery && visibleCustomers.length === 0 ? (
        <Text style={styles.noMatch}>No customers match "{query.trim()}"</Text>
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
    // Selected = light primary tint + primary border, per the design mock —
    // NOT a solid primary fill (that drowned the icon and label).
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1.5,
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
    color: colors.primary,
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
