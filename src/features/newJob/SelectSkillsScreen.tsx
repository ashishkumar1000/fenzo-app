/**
 * SelectSkillsScreen — full-screen skill browser behind New Job's
 * "Browse all" (product feedback 2026-09-20): searchable catalog rows with
 * icon, name and one-line description, a circle toggle per row, and a sticky
 * Apply button.
 *
 * Single-select by design (a job carries exactly one skill/workflow): tapping
 * a row replaces the pending selection. Apply (enabled only once a row is
 * picked) returns to New Job with the pending id. "Clear" means "this job
 * needs no skill" — it returns immediately with `null`, so the caller can
 * drop the skill and re-collapse the form.
 *
 * Skills come straight from the shared `useSkills` store (same fetch New Job
 * already made) — nothing skill-specific is hardcoded here; icons resolve
 * from the catalog's `icon` field via `SkillIcon`.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Search } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import { SkillIcon, useSkills } from '../skills';
import type { Skill } from '../../services';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SelectSkills'>;

const CIRCLE = 26;

export default function SelectSkillsScreen({ navigation, route }: Props) {
  // The id the caller came in with — tap rows to replace it, "Clear" to
  // empty it. Only Apply sends it back.
  const [pendingId, setPendingId] = useState<string | null>(
    route.params?.selectedSkillId ?? null,
  );
  const [query, setQuery] = useState('');

  const { skills, isLoading, error, refresh } = useSkills();

  const trimmedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmedQuery) return skills;
    return skills.filter(
      skill =>
        skill.name.toLowerCase().includes(trimmedQuery) ||
        skill.description.toLowerCase().includes(trimmedQuery),
    );
  }, [skills, trimmedQuery]);

  const apply = () => {
    // NewJob sits directly beneath this screen, so popTo pops us off the
    // stack and merges the param onto it. React Navigation 7's plain
    // `navigate` no longer goes back to an existing screen — it PUSHES a new
    // one, which left this screen stranded in the stack (it resurfaced after
    // New Job's post-create goBack).
    navigation.popTo('NewJob', { selectedSkillId: pendingId }, { merge: true });
  };

  // Only reachable with a pending selection (disabled otherwise): "no skill"
  // is a decision too, so it applies straight away instead of leaving the
  // user stuck on a screen whose Apply button is now disabled.
  const clearAndReturn = () => {
    navigation.popTo('NewJob', { selectedSkillId: null }, { merge: true });
  };

  const renderRow = ({ item }: { item: Skill }) => {
    const isSelected = item.id === pendingId;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        // The description is part of what tells two similarly-named skills
        // apart — announce it with the name, not just the name alone.
        accessibilityLabel={`${item.name}. ${item.description}`}
        onPress={() => setPendingId(item.id)}
        style={styles.row}>
        <View style={styles.rowIcon}>
          <SkillIcon
            name={item.icon}
            size={20}
            strokeWidth={1.75}
            color={isSelected ? colors.primary : colors.textStrong}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text numberOfLines={2} style={styles.rowDescription}>
            {item.description}
          </Text>
        </View>
        <View
          style={[styles.toggle, isSelected ? styles.toggleOn : styles.toggleOff]}>
          {isSelected ? (
            <Check size={16} strokeWidth={3} color={colors.onPrimary} />
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Select skills</Text>
      </View>

      <View style={styles.subHeader}>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{skills.length} total</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          disabled={pendingId === null}
          onPress={clearAndReturn}>
          <Text
            style={[
              styles.clearText,
              pendingId === null && styles.clearTextDisabled,
            ]}>
            Clear
          </Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Choose the required capability for this job.
      </Text>

      <View style={styles.searchWrap}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search skills"
          accessibilityLabel="Search skills"
          leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
        />
      </View>

      {/* The footer must stay reachable while the search keyboard is up —
          same padding behaviour as NewJobScreen. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isLoading && skills.length === 0 ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && skills.length === 0 ? (
          <View style={styles.status}>
            <Text style={styles.statusText}>{error}</Text>
            <Button variant="secondary" size="sm" onPress={refresh}>
              Try again
            </Button>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={skill => skill.id}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              // An empty catalog and an empty search result are different
              // states — the copy must not assume a search is active.
              <Text style={styles.empty}>
                {skills.length === 0
                  ? 'No skills are available yet. Try again shortly.'
                  : `No skills match "${query.trim()}"`}
              </Text>
            }
          />
        )}

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {/* Nothing selected → nothing to apply: the button stays disabled
              until a row is picked. */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={pendingId === null}
            onPress={apply}>
            Apply selection
          </Button>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
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
  clearText: {
    ...typography.labelStrong,
    color: colors.primary,
    // Comfortably past the 44px touch minimum around a small text link.
    padding: spacing.s2,
  },
  clearTextDisabled: {
    color: colors.textMuted,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  searchWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  list: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  rowDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  toggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOff: {
    borderWidth: 2,
    borderColor: colors.borderSubtle,
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  statusText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.s6,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
});
