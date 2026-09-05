/**
 * SkillsScreen — the tenant's skill list from `GET /skills`, with an "+ Add"
 * action that opens the `AddSkillSheet` and per-row delete.
 *
 * Renders exclusively from the shared `useSkills` store (same source as the
 * invite flow's skill picker), so there is exactly one fetch path to the
 * endpoint. Deletes are optimistic (`removeSkill`) with rollback on failure;
 * the delete confirm dialog's cascade copy is the API contract — the backend
 * silently removes the skill from technicians who have it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, RefreshCw, Trash2, Wrench } from 'lucide-react-native';
import { Button, Card, EmptyState, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { Skill } from '../../services';
import type { RootStackParamList } from '../../navigation/types';
import { addSkill, loadSkills, removeSkill, useSkills } from './useSkills';
import { AddSkillSheet } from './components/AddSkillSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'Skills'>;

/** "Added 12 Aug 2026" — Indian English date order per the design spec. */
function formatAdded(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Added ${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export default function SkillsScreen({ navigation }: Props) {
  const { skills, isLoading, error, hasLoaded, refresh } = useSkills();
  const [sheetVisible, setSheetVisible] = useState(false);

  // Refetch every time the screen is focused — the sheet stays mounted after
  // the first open, and skills can also change via the invite flow on other
  // screens. The store throttles, so repeated focus costs nothing.
  useFocusEffect(
    useCallback(() => {
      void loadSkills();
    }, []),
  );

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  // A failed load with rows already on screen keeps the rows behind a
  // dismissible banner; the dismissal is local (the store's error clears on
  // the next success).
  const [loadErrorDismissed, setLoadErrorDismissed] = useState(false);
  useEffect(() => {
    setLoadErrorDismissed(false);
  }, [error]);

  // A failed delete (anything except 404) rolls the row back and surfaces
  // here; the banner clears on the next successful delete.
  const [deleteError, setDeleteError] = useState('');

  // The confirm dialog's copy IS the cascade contract: deleting removes the
  // skill from any technician who has it, silently, server-side.
  const confirmDelete = (skill: Skill) => {
    Alert.alert('Delete skill', 'It will also be removed from any technicians who have it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeSkill(skill.id).then(
            () => setDeleteError(''),
            (err: { message?: string }) => {
              setDeleteError(err?.message || 'Could not delete the skill. Try again.');
            },
          );
        },
      },
    ]);
  };

  // Pull-to-refresh style retry, wired to the empty-state CTA when a load
  // failed with nothing on screen.
  const handleRetry = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backButton}
            accessibilityLabel="Go back">
            <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Skills</Text>
        </View>

        <Button variant="primary" size="sm" onPress={() => setSheetVisible(true)}>
          Add
        </Button>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* A failed load with rows already on screen: keep the rows, explain
              why they may be stale. With nothing on screen the error takes
              the full EmptyState below instead. */}
          {error && skills.length > 0 && !loadErrorDismissed ? (
            <View style={styles.bannerWrap}>
              <InlineError
                message={error}
                onDismiss={() => setLoadErrorDismissed(true)}
              />
            </View>
          ) : null}

          {deleteError ? (
            <View style={styles.bannerWrap}>
              <InlineError message={deleteError} onDismiss={() => setDeleteError('')} />
            </View>
          ) : null}

          <FlatList
            data={skills}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Card padding="md" style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {formatAdded(item.createdAt) ? (
                    <Text style={styles.rowAdded}>{formatAdded(item.createdAt)}</Text>
                  ) : null}
                </View>
                <IconButton
                  label={`Delete ${item.name}`}
                  size="sm"
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteButton}>
                  <Trash2 size={18} color={colors.danger} strokeWidth={2} />
                </IconButton>
              </Card>
            )}
            contentContainerStyle={[
              styles.listContent,
              skills.length === 0 && styles.listContentEmpty,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={refreshControl}
            ListEmptyComponent={
              error ? (
                <EmptyState
                  icon={<Wrench size={36} color={colors.danger} strokeWidth={1.5} />}
                  title="Couldn't load skills"
                  description={error}
                  ctaLabel="Try again"
                  ctaIcon={<RefreshCw size={18} color={colors.onPrimary} strokeWidth={2} />}
                  onPressCta={handleRetry}
                />
              ) : hasLoaded ? (
                <EmptyState
                  icon={<Wrench size={36} color={colors.primary} strokeWidth={1.5} />}
                  title="No skills yet — add your first"
                  description="Add skills so you can assign them to technicians."
                  ctaLabel="Add a skill"
                  onPressCta={() => setSheetVisible(true)}
                />
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <AddSkillSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={addSkill}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flex: 1,
  },
  backButton: {
    marginLeft: -spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  separator: {
    height: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  rowAdded: {
    ...typography.caption,
    color: colors.textMuted,
  },
  deleteButton: {
    width: 44,
    height: 44,
  },
});
