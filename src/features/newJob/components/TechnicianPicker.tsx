/**
 * TechnicianPicker — the New Job technician section, mirroring the
 * CustomerPicker pattern (story 11-8): a header row — count chip ("N
 * technicians") and a "Browse all" link to the full-screen Select
 * Technicians page; a search field that filters the offered roster
 * client-side; a 3-column tile grid.
 *
 * The idle grid shows the first two offered technicians (the caller already
 * skill-filters the roster and keeps the profile's order — this picker
 * reorders nothing) plus a "+N More technicians" tile that opens the same
 * full-screen page. A selection made outside those two (via "Browse all" or
 * an invite) is pinned to the front — otherwise the chosen tile would be
 * invisible on the default surface, leaving the section with no visible
 * answer to "who is this job for?".
 *
 * Single-select with toggle-to-clear (carried over from the sheet-variant
 * picker): tapping the selected tile again hands back `null`, because the
 * draft allows an unassigned state — unlike customers, where the tap simply
 * replaces the pick.
 *
 * Selected styling follows the customer tiles: light primary tint with a
 * primary border, primary label, and a solid primary check badge. The
 * technician's avatar (initials on a name-derived tint, via the DS `Avatar`)
 * keeps its own tint when selected — the badge and border already mark the
 * state. A technician still waiting on the app install shows the "Invited"
 * caption rather than vanishing — someone just added shouldn't disappear.
 *
 * The section name ("Technician") renders inline in the header before
 * the count chip — one line, exactly like the SkillPicker/CustomerPicker
 * headers.
 *
 * Not the same component as `src/components/TechnicianPicker.tsx` (the
 * EditJobSheet rows variant) — that one is untouched by this story; New Job
 * reads this feature-local twin. Presentational: the parent owns the option
 * list and the selection.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Search } from 'lucide-react-native';
import { Avatar, Input } from '../../../components/ui';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import { filterTechnicians } from '../../technicians';
import type { ProfileTechnician } from '../../../services';

const COLUMNS = 3;
const GAP = spacing.s3;
/**
 * Tiles on screen before the "+N more" tile takes over — 2, matching the
 * SkillPicker/CustomerPicker, so 2 tiles + the more tile fill exactly one
 * complete row (COLUMNS divides VISIBLE_TILES + 1); any other count leaves
 * the "+N more" tile dangling on a row of its own.
 */
const VISIBLE_TILES = 2;

type Props = {
  /** Section name rendered inline before the count chip (e.g. "Technician"). */
  title?: string;
  options: ProfileTechnician[];
  value: string | null;
  /** The tapped id, or `null` when the selected tile is tapped again. */
  onChange: (id: string | null) => void;
  onBrowseAll: () => void;
};

export function TechnicianPicker({ title, options, value, onChange, onBrowseAll }: Props) {
  const [rowWidth, setRowWidth] = useState(0);
  const [query, setQuery] = useState('');

  // 0 until the first layout pass — tiles render at natural width for that
  // one frame, which is invisible in practice.
  const tileWidth =
    rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;

  const trimmedQuery = query.trim();

  /**
   * Empty query → the default surface: the first two offered technicians
   * plus the "+N more" tile. Non-empty → every match across the offered
   * roster (same name-or-phone semantics as the customers picker), so a
   * search finds rows beyond the idle tiles without leaving the screen.
   */
  const visibleTechnicians = useMemo(() => {
    if (trimmedQuery) return filterTechnicians(options, trimmedQuery);
    const base = options.slice(0, VISIBLE_TILES);
    if (value && !base.some(technician => technician.id === value)) {
      const selected = options.find(technician => technician.id === value);
      if (selected) return [selected, ...base].slice(0, VISIBLE_TILES);
    }
    return base;
  }, [options, trimmedQuery, value]);

  const moreCount = options.length - VISIBLE_TILES;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>
              {options.length}{' '}
              {options.length === 1 ? 'technician' : 'technicians'}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse all technicians"
          onPress={onBrowseAll}
          style={styles.browseRow}>
          <Text style={styles.browseText}>Browse all</Text>
          <ChevronRight size={16} strokeWidth={2} color={colors.primary} />
        </Pressable>
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search technicians"
        accessibilityLabel="Search technicians"
        leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
      />

      <View
        style={styles.grid}
        onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
        {visibleTechnicians.map(technician => {
          const isSelected = technician.id === value;

          return (
            <Pressable
              key={technician.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              // The "Invited" caption is visual-only — name it for screen
              // readers too, so a just-invited technician isn't silent.
              accessibilityLabel={
                technician.status === 'invited'
                  ? `${technician.name}. Invited`
                  : technician.name
              }
              onPress={() => onChange(isSelected ? null : technician.id)}
              style={[
                styles.tile,
                tileWidth ? { width: tileWidth } : null,
                isSelected && styles.tileSelected,
              ]}>
              <Avatar name={technician.name} size="md" />
              <Text
                numberOfLines={2}
                style={[styles.label, isSelected && styles.labelSelected]}>
                {technician.name}
              </Text>
              {technician.status === 'invited' ? (
                <Text style={styles.invited}>Invited</Text>
              ) : null}
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
            accessibilityLabel={`More technicians — ${moreCount} more available`}
            onPress={onBrowseAll}
            style={[styles.tile, styles.tileMore, tileWidth ? { width: tileWidth } : null]}>
            <Text style={styles.moreCount}>+{moreCount}</Text>
            <Text numberOfLines={2} style={styles.moreLabel}>
              More technicians
            </Text>
          </Pressable>
        ) : null}
      </View>

      {trimmedQuery && visibleTechnicians.length === 0 ? (
        <Text style={styles.noMatch}>No technicians match "{query.trim()}"</Text>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  countChip: {
    backgroundColor: colors.onPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
    // The band this section sits on can be surfaceSunken too — the hairline
    // keeps the pill legible on both band colours.
    borderWidth: 1,
    borderColor: palette.gray200,
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
    borderColor: colors.borderSubtle,
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
  // Deliberately not a Badge: that component's vocabulary is fixed to job
  // state (Done / In Progress / Scheduled / Cancelled / neutral) and its doc
  // says not to invent synonyms. "Invited" is a technician's state, not a
  // job's.
  invited: {
    ...typography.caption,
    color: colors.textMuted,
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
