/**
 * TechnicianPicker — search field plus the owner's technician roster.
 *
 * Two layouts:
 *   tiles (default) — horizontal tile row, as on New job.
 *   rows            — vertical list with skills caption and a trailing check,
 *                     sized for a sheet (Edit job).
 *
 * Single-select: tapping the selected tile/row again clears the assignment,
 * so a job can be left unassigned without a separate "none" option. Callers
 * treat a `null` selection as "keep whatever applied before" — the API cannot
 * unassign a job, so a deselection simply never reaches the wire.
 *
 * Technicians come from `/users/me` (server ids, safe to send). The search
 * query is local state — filtering a list this small client-side is the right
 * call, and stays right until the team outgrows one screen.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Search } from 'lucide-react-native';
import { Avatar, Input } from './ui';
import { colors, radius, spacing, touch, typography } from '../theme';
import type { ProfileTechnician } from '../services';

type Variant = 'tiles' | 'rows';

type Props = {
  technicians: ProfileTechnician[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  variant?: Variant;
};

export function TechnicianPicker({ technicians, selectedId, onSelect, variant = 'tiles' }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter(t => t.name.toLowerCase().includes(q));
  }, [technicians, query]);

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

      {/* Empty roster vs no search match read very differently to the user —
          one means "nothing exists yet (or the roster is still loading)", the
          other means "your search was too narrow". Never conflate them. */}
      {technicians.length === 0 ? (
        <Text style={styles.noMatch}>No technicians added yet.</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.noMatch}>No technician matches that name.</Text>
      ) : variant === 'rows' ? (
        <Rows technicians={filtered} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <Tiles technicians={filtered} selectedId={selectedId} onSelect={onSelect} />
      )}
    </View>
  );
}

function Tiles({
  technicians,
  selectedId,
  onSelect,
}: {
  technicians: ProfileTechnician[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {technicians.map(technician => {
        const isSelected = technician.id === selectedId;
        // A technician still waiting on the app install shows as "Invited"
        // rather than vanishing — someone just added shouldn't disappear.
        const isInvited = technician.status === 'invited';

        return (
          <Pressable
            key={technician.id}
            testID={`technician-tile-${technician.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={technician.name}
            onPress={() => onSelect(isSelected ? null : technician.id)}
            style={[styles.tile, isSelected && styles.tileSelected]}>
            <Avatar name={technician.name} size="md" />
            <Text
              numberOfLines={1}
              style={[styles.name, isSelected && styles.nameSelected]}>
              {technician.name}
            </Text>
            {isInvited ? <Text style={styles.invited}>Invited</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Rows({
  technicians,
  selectedId,
  onSelect,
}: {
  technicians: ProfileTechnician[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      style={styles.rowsScroll}
      contentContainerStyle={styles.rows}>
      {technicians.map(technician => {
        const isSelected = technician.id === selectedId;

        return (
          <Pressable
            key={technician.id}
            testID={`technician-row-${technician.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={technician.name}
            onPress={() => onSelect(isSelected ? null : technician.id)}
            style={[styles.listRow, isSelected && styles.listRowSelected]}>
            <Avatar name={technician.name} size="md" />
            <View style={styles.listRowText}>
              <Text
                numberOfLines={1}
                style={[styles.listName, isSelected && styles.listNameSelected]}>
                {technician.name}
              </Text>
              {technician.skills.length ? (
                <Text style={styles.listSkills} numberOfLines={1}>
                  {technician.skills.join(', ')}
                </Text>
              ) : null}
            </View>
            <View
              style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
              {isSelected ? (
                <Check size={14} color={colors.onPrimary} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
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
  // Deliberately not a Badge: that component's vocabulary is fixed to job
  // state (Done / In Progress / Scheduled / Cancelled / neutral) and its doc
  // says not to invent synonyms. "Invited" is a technician's state, not a
  // job's.
  invited: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowsScroll: {
    // A long roster shouldn't push the sheet's footer off screen — the list
    // scrolls inside its own box instead.
    maxHeight: 240,
  },
  rows: {
    gap: spacing.s2,
    // Room for the selected row's border without clipping at the edges.
    paddingVertical: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
  },
  listRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  listRowText: {
    flex: 1,
    gap: 2,
  },
  listName: {
    ...typography.label,
    color: colors.textBody,
  },
  listNameSelected: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  listSkills: {
    ...typography.caption,
    color: colors.textMuted,
  },
  checkCircle: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
