/**
 * JobsScreen — full job list with status filter chips (All / Scheduled /
 * In progress / Done / Cancelled) and a "+ New job" action that pushes the
 * NewJob route.
 *
 * Live data via the `useJobs` store (`GET /jobs`): loads on mount and on
 * focus (throttled server-side in the store, so coming back from a created
 * job refreshes without hammering the endpoint), pages in on scroll-end, and
 * pulls to refresh. The filter row is always visible, even with no jobs at
 * all, so the sections are discoverable from the first launch. Any section
 * with nothing in it gets the full "No jobs yet" empty state rather than a
 * stray line of text — with copy that says what would land in *that* section.
 *
 * List rows carry only `customerId`/`technicianId`, so display names are
 * resolved client-side: customers from the customers store, technicians from
 * the roster in `GET /users/me`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  ClipboardList,
  Plus,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { useMyProfile } from '../profile';
import { useCustomers } from '../customers';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { useJobs } from './useJobs';
import type { ApiJob, JobFilter } from './types';

/**
 * Empty-state icon and copy per section — the icon hints at the section's
 * meaning (a calendar for what's booked, a wrench for work underway) so the
 * empty pages aren't identical.
 */
const EMPTY_BY_FILTER: Record<JobFilter, { icon: LucideIcon; description: string }> = {
  all: {
    icon: ClipboardList,
    description:
      'Create your first job to assign it to a technician and track it through to completion.',
  },
  scheduled: {
    icon: CalendarClock,
    description: 'Jobs booked for a future date and time will show up here.',
  },
  in_progress: {
    icon: Wrench,
    description:
      'Jobs a technician has started, but not yet finished, will show up here.',
  },
  completed: {
    icon: CircleCheck,
    description: 'Jobs a technician has marked complete will show up here.',
  },
  cancelled: {
    icon: CircleX,
    description: 'Jobs called off before completion will show up here.',
  },
};

/**
 * Jobs is a tab screen, but "New job" is a full-screen route on the root
 * stack — hence the composite props rather than plain tab props.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function JobsScreen({ navigation }: Props) {
  const { jobs, filter, isLoading, isLoadingMore, error, loadJobs, loadMoreJobs, refresh, setFilter } =
    useJobs();
  const { customers } = useCustomers();
  const { profile } = useMyProfile();

  // Refetch on every focus — the store throttles (skips within 15s of a
  // success), so returning from a created job shows it without extra load.
  useFocusEffect(
    useCallback(() => {
      void loadJobs();
    }, [loadJobs]),
  );

  // `customerId` → display name, for the card titles.
  const customerNames = useMemo(
    () => new Map(customers.map(c => [c.id, c.name])),
    [customers],
  );

  // `technicianId` → display name, from the server-issued roster.
  const technicianNames = useMemo(
    () => new Map((profile?.technicians ?? []).map(t => [t.id, t.name])),
    [profile],
  );

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next success).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  const hasData = jobs.length > 0;
  // A failed load with nothing to show replaces the empty state entirely —
  // "no jobs yet" would be a lie when the request just failed.
  const failedWithNoData = Boolean(error) && !isLoading && !hasData;
  const showBanner = Boolean(error) && hasData && !errorDismissed;

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  const isEmpty = !isLoading && !failedWithNoData && !hasData;
  const { icon: EmptyIcon, description: emptyDescription } = EMPTY_BY_FILTER[filter];

  const handleNewJob = () => {
    navigation.navigate('NewJob');
  };

  const handleOpenJob = (_job: ApiJob) => {
    // TODO: navigate to a job detail screen once it exists.
  };

  const renderJob = useCallback(
    ({ item }: { item: ApiJob }) => (
      <JobCard
        job={item}
        customerName={customerNames.get(item.customerId)}
        technicianName={technicianNames.get(item.technicianId)}
        onPress={handleOpenJob}
      />
    ),
    [customerNames, technicianNames],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Button
          variant="primary"
          size="md"
          shape="pill"
          onPress={handleNewJob}
          leadingIcon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          New job
        </Button>
      </View>

      <View style={styles.filterWrap}>
        <StatusFilterBar value={filter} onChange={setFilter} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failedWithNoData ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={error ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void refresh()}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* A failed refresh with rows already on screen: keep the rows,
              explain why they may be stale. */}
          {showBanner ? (
            <View style={styles.bannerWrap}>
              <InlineError message={error ?? ''} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}

          <FlatList
            data={jobs}
            keyExtractor={item => item.id}
            renderItem={renderJob}
            onEndReached={() => void loadMoreJobs()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
            }
            // When empty: flexGrow gives EmptyState's `flex: 1` a height to
            // centre itself in, and the list padding drops away since
            // EmptyState brings its own horizontal inset.
            contentContainerStyle={[
              styles.listContent,
              isEmpty && styles.listContentEmpty,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              // No CTA here — the "New job" button in the header is the single
              // entry point, so the centre of the page stays informational.
              <EmptyState
                icon={<EmptyIcon size={36} color={colors.primary} strokeWidth={1.5} />}
                title="No jobs yet"
                description={emptyDescription}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
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
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  filterWrap: {
    paddingLeft: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  footerSpinner: {
    paddingVertical: spacing.s4,
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
});