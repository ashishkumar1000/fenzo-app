/**
 * TechnicianPicker — search field plus a horizontal row of technician tiles.
 *
 * Single-select: tapping the selected tile again clears the assignment, so a
 * job can be created unassigned without a separate "none" tile.
 *
 * The search query is local state — filtering a list this small client-side is
 * the right call, and stays right until the team outgrows one screen. At that
 * point lift `query` out and let the parent debounce it into a server search.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Avatar, Input } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { TechnicianOption } from '../types';

type Props = {
  options: TechnicianOption[];
  value: string | null;
  onChange: (id: string | null) => void;
};

export function TechnicianPicker({ options, value, onChange }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(t => t.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={styles.wrap}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search technician..."
        autoCapitalize="none"
        autoCorrect={false}
        leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
      />

      {filtered.length === 0 ? (
        <Text style={styles.noMatch}>No technician matches that name.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}>
          {filtered.map(technician => {
            const isSelected = technician.id === value;

            return (
              <Pressable
                key={technician.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={technician.name}
                onPress={() => onChange(isSelected ? null : technician.id)}
                style={[styles.tile, isSelected && styles.tileSelected]}>
                <Avatar name={technician.name} size="md" />
                <Text
                  numberOfLines={1}
                  style={[styles.name, isSelected && styles.nameSelected]}>
                  {technician.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
    // Room for the selected tile's border without clipping at the edges.
    paddingVertical: 2,
  },
  noMatch: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  tile: {
    width: 116,
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
  name: {
    ...typography.label,
    color: colors.textBody,
    textAlign: 'center',
  },
  nameSelected: {
    ...typography.labelStrong,
    color: colors.primary,
  },
});
