/**
 * JobsScreen — the owner's full job timeline: a segmented scope control
 * (Today · Upcoming · Overdue · History) over the status filter chips, plus a
 * "+ New job" action that pushes the NewJob route.
 *
 * Live data via the `useJobs` store (`GET /jobs?scope=…`): loads on mount and
 * on focus (throttled server-side in the store, so coming back from a created
 * job refreshes without hammering the endpoint), pages in on scroll-end, and
 * pulls to refresh. Home's stat tiles navigate here pre-set to a scope — the
 * one-shot `scope` route param is consumed then cleared on focus (tab params
 * persist, so an uncleared param would re-apply on every tab-bar focus).
 *
 * Chips are visible only where status is user-selectable: all five under
 * Today, All/Done/Cancelled under History. Upcoming and Overdue hide the row —
 * the server pre-narrows status there, so chips would lie. Every
 * scope × chip combination gets its own real empty-state copy.
 *
 * List rows carry only `customerId`/`technicianId`, so display names are
 * resolved client-side: customers from the customers store, technicians from
 * the roster in `GET /users/me`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  CalendarClock,
  CircleAlert,
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
import { Button, EmptyState, InlineError, SegmentedControl } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { useMyProfile } from '../profile';
import { useCustomers } from '../customers';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { useJobs } from './useJobs';
import { filterForScope, HISTORY_FILTERS } from './scopeFilters';
import type { ApiJob, JobFilter, JobScope } from './types';

/** Scope selector labels — the four timeline buckets. */
const SCOPES: { value: JobScope; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'history', label: 'History' },
];

/**
 * Empty-state icon + copy per scope × chip — the icon hints at the section's
 * meaning so empty pages aren't identical. Today keeps the original per-chip
 * entries (the Story 1.1 baseline); the other scopes get their own.
 */
type EmptyStateSpec = { icon: LucideIcon; title: string; description: string };

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

function emptyStateFor(scope: JobScope, filter: JobFilter): EmptyStateSpec {
  if (scope === 'today') {
    return { title: 'No jobs yet', ...EMPTY_BY_FILTER[filter] };
  }
  if (scope === 'upcoming') {
    return {
      icon: CalendarClock,
      title: 'No upcoming jobs',
      description: 'Jobs booked for tomorrow or later will show up here.',
    };
  }
  if (scope === 'overdue') {
    return {
      icon: CircleAlert,
      title: 'Nothing overdue',
      description: 'Jobs past their date that were never finished will show up here.',
    };
  }
  if (filter === 'completed') {
    return { title: 'No history yet', ...EMPTY_BY_FILTER.completed };
  }
  if (filter === 'cancelled') {
    return { title: 'No history yet', ...EMPTY_BY_FILTER.cancelled };
  }
  return {
    icon: ClipboardList,
    title: 'No history yet',
    description: 'Jobs marked complete or cancelled will show up here.',
  };
}

/**
 * Jobs is a tab screen, but "New job" is a full-screen route on the root
 * stack — hence the composite props rather than plain tab props.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function JobsScreen({ navigation, route }: Props) {
  const {
    jobs,
    filter,
    scope,
    isLoading,
    isLoadingMore,
    error,
    loadJobs,
    loadMoreJobs,
    refresh,
    setFilter,
  } = useJobs();
  const { customers } = useCustomers();
  const { profile } = useMyProfile();

  // Refetch on every focus — the store throttles (skips within 15s of a
  // success), so returning from a created job shows it without extra load.
  // Home's tiles land here with a one-shot `scope` param: applied when it
  // differs from the store's scope, then cleared immediately — tab params
  // persist across navigations, so leaving it would re-apply on every later
  // tab-bar focus and fight a scope the user picked manually. Param
  // consumption happens BEFORE the focus refetch, inside the same effect, so
  // the param's load and the focus refetch are one query, not a race.
  useFocusEffect(
    useCallback(() => {
      const paramScope = route.params?.scope;
      if (paramScope && paramScope !== scope) {
        void loadJobs(paramScope, filterForScope(filter, paramScope));
      }
      if (paramScope) {
        navigation.setParams({ scope: undefined });
      }
      void loadJobs();
    }, [route.params?.scope, scope, filter, loadJobs, navigation]),
  );

  /** Scope selector handler — one `loadJobs` with the reset/kept filter. */
  const handleScopeChange = useCallback(
    (next: JobScope) => {
      if (next === scope) return;
      void loadJobs(next, filterForScope(filter, next));
    },
    [scope, filter, loadJobs],
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
  const { icon: EmptyIcon, title: emptyTitle, description: emptyDescription } =
    emptyStateFor(scope, filter);

  const handleNewJob = () => {
    navigation.navigate('NewJob');
  };

  const handleOpenJob = (job: ApiJob) => {
    navigation.navigate('JobDetail', { jobId: job.id });
  };

  const renderJob = useCallback(
    ({ item }: { item: ApiJob }) => (
      <JobCard
        job={item}
        scope={scope}
        customerName={customerNames.get(item.customerId)}
        technicianName={technicianNames.get(item.technicianId)}
        onPress={handleOpenJob}
      />
    ),
    [customerNames, technicianNames, scope],
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
        <SegmentedControl options={SCOPES} value={scope} onChange={handleScopeChange} />
        {/* Chips only where status is user-selectable: all five under Today,
            All/Done/Cancelled under History. Upcoming and Overdue hide the
            row — the server pre-narrows status there, so chips would lie.
            The row stays visible even with no jobs, as in Story 1.1, so the
            sections stay discoverable. Visual hierarchy: the segmented
            control owns "you are here" (view switching); these chips are a
            filter and use a soft-tint active state (StatusFilterBar). */}
        {scope === 'today' || scope === 'history' ? (
          <StatusFilterBar
            value={filter}
            onChange={setFilter}
            filters={scope === 'history' ? HISTORY_FILTERS : undefined}
          />
        ) : null}
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
                title={emptyTitle}
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
    paddingRight: spacing.s4,
    paddingBottom: spacing.s3,
    // Gap between the segmented control and the status chip row (s3 = 12).
    // No-op on Upcoming/Overdue, where the chip row is hidden.
    gap: spacing.s3,
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