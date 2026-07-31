/**
 * ServiceTypePicker — single-select grid of service-type tiles.
 *
 * Tile width is measured from the container via `onLayout` rather than
 * derived from the screen width, so the grid stays correct wherever it's
 * placed (and on rotation / split-screen) without needing to know the
 * parent's padding.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ServiceType } from '../types';

const COLUMNS = 3;
const GAP = spacing.s3;

type Props = {
  options: ServiceType[];
  value: string | null;
  onChange: (id: string) => void;
};

export function ServiceTypePicker({ options, value, onChange }: Props) {
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
        const Icon = option.icon;
        const isSelected = option.id === value;

        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
            style={[
              styles.tile,
              tileWidth ? { width: tileWidth } : null,
              isSelected && styles.tileSelected,
            ]}>
            <Icon
              size={22}
              strokeWidth={1.75}
              color={isSelected ? colors.primary : colors.textStrong}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, isSelected && styles.labelSelected]}>
              {option.label}
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
