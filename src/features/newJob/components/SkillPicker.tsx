/**
 * SkillPicker — single-select grid of skill tiles, fed by the global skills
 * catalog (`GET /skills` via the `useSkills` store).
 *
 * Deliberately modeled on the deleted service-type tile grid (same 3-column
 * grid, `accessibilityState={{ selected }}`, controlled `value`/`onChange`),
 * with two deltas: the options are `Skill` rows (id + name from the catalog)
 * and there is no per-skill icon — skills carry no icon data, so every tile
 * renders the same neutral `Wrench` glyph above its label for visual
 * continuity with the grid it replaced.
 *
 * Presentational, like its predecessor: the parent owns the option list and
 * the selection.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wrench } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { Skill } from '../../../services';

const COLUMNS = 3;
const GAP = spacing.s3;

type Props = {
  options: Skill[];
  value: string | null;
  onChange: (id: string) => void;
};

export function SkillPicker({ options, value, onChange }: Props) {
  const [rowWidth, setRowWidth] = useState(0);

  // 0 until the first layout pass — tiles render at natural width for that
  // one frame, which is invisible in practice.
  const tileWidth =
    rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : undefined;

  return (
    <View
      style={styles.grid}
      onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
      {options.map(option => {
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
            <Wrench
              size={22}
              strokeWidth={1.75}
              color={isSelected ? colors.primary : colors.textStrong}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, isSelected && styles.labelSelected]}>
              {option.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    // Comfortably past the 44px touch minimum.
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
  },
  tileSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
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
});
