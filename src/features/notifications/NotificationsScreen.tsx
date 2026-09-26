/**
 * NotificationsScreen — the shared notification inbox (Story 3.4, redesigned
 * 2026-09; generalized to both roles in Story 14-3 — one screen, never a
 * second inbox).
 *
 * A full-screen root-stack route (sibling of JobDetail / TechJobDetail —
 * covers the tab bar), opened from either bell (Jobs header, Home header,
 * technician Today header). Newest-first cursor-paginated list over the
 * `useNotifications` shared store: loads on focus (TTL-throttled in the
 * store), pages in on scroll-end, pulls to refresh, and carries the
 * "Mark all read" action in its header.
 *
 * The redesign renders one CARD per job (grouped client-side from the flat
 * list by `notificationCardModel.ts` — the card's stage timeline comes from
 * that job's own notifications, no extra API calls) behind an All / Active /
 * Completed filter chip row. Epic 12 report notifications (`report_ready` /
 * `report_failed`, job_id NULL) get their own card kind instead (see
 * `reportNotificationModel.ts`): they show under "All" only — the Active /
 * Completed chips are job-status buckets — and their button opens the
 * Reports screen, never JobDetail.
 *
 * Story 14-3's event-type registry (`notificationEventRegistry.ts`) decides
 * what EVERY row renders as, keyed on event type + role: job-status rows →
 * the grouped job card, report rows → the report card (owner only), and
 * anything this build doesn't know yet → the inert generic card. A tap's
 * deep link routes per role: job cards open JobDetail for the owner and
 * TechJobDetail for the technician; report cards are owner-only; generic
 * cards are not tappable. The empty state's "Go to jobs" CTA is owner-only.
 *
 * Tapping a card is NAVIGATE-FIRST: the deep link to that event's screen is
 * the user's intent; the optimistic mark-read of the card's unread events is
 * cosmetic and happens alongside it (read cards still navigate — no POST,
 * no rollback ceremony).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Bell, Check, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type {
  MainTabParamList,
  RootStackParamList,
  TechnicianRootStackParamList,
} from '../../navigation/types';
import { useAuth } from '../auth/useAuth';
import {
  loadMoreNotifications,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from './useNotifications';
import { NotificationCard } from './components/NotificationCard';
import { NotificationFilterBar } from './components/NotificationFilterBar';
import { GenericNotificationCard } from './components/GenericNotificationCard';
import { filterCards, groupNotificationsByJob } from './notificationCardModel';
import {
  buildReportCards,
  mergeNotificationCards,
} from './reportNotificationModel';
import {
  buildGenericCards,
  type SessionRole,
} from './notificationEventRegistry';
import { useJobTemplateCache } from './useJobTemplateCache';
import type { NotificationFilter } from './notificationCardModel';
import type {
  NotificationListItem,
  TappableNotificationListItem,
} from './reportNotificationModel';

/**
 * Both stacks' routes plus both tab groups, in one param list — the shared
 * screen is registered in the owner's RootNavigator AND the technician's
 * TechnicianRootNavigator (Story 14-3), and the role decides which routes a
 * tap leads to: job cards → JobDetail (owner) / TechJobDetail (technician),
 * report cards → Reports (owner), the empty-state CTA → the Jobs tab
 * (owner). `Notifications` itself is deliberately declared in both stacks
 * (this screen's own route), so the intersection typechecks for every
 * `navigate` below — cross-tree routes are kept apart only by the runtime
 * role guards, not by the types.
 */
type SharedRoutes = RootStackParamList &
  TechnicianRootStackParamList &
  MainTabParamList;

type Props = NativeStackScreenProps<SharedRoutes, 'Notifications'>;

export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  // The screen is only reachable with a session; `owner` is also the
  // bootstrap fallback so the original behaviour is the default.
  const role: SessionRole = session?.role ?? 'owner';
  const {
    items,
    isLoading,
    isLoadingMore,
    error,
    mutationError,
    hasLoaded,
    hasMore,
    loadUnreadCount,
    refresh,
    markNotificationRead,
  } = useNotifications();

  // Same discipline as JobsScreen: refetch on focus (the store throttles),
  // so returning to the screen picks up events fired while it was closed.
  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
      void loadUnreadCount();
    }, [loadNotifications, loadUnreadCount]),
  );

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
    void loadUnreadCount({ force: true });
  }, [refresh, loadUnreadCount]);

  const handleMarkAllRead = useCallback(() => {
    void markAllNotificationsRead();
    // The badge is shared state — the store force-refetches the count from
    // the server on success; a failure lands in `mutationError` (banner
    // below) and reconciles via the store's server re-ask.
  }, []);

  const handleCardPress = useCallback(
    (card: TappableNotificationListItem) => {
      // Navigate first — the deep link is the user's intent and must not
      // wait on the mark-read POST. Read-state is cosmetic (handled
      // optimistically inside the store, with its own rollback). Opening a
      // job's card settles ALL of its unread events (the POSTs are
      // idempotent; a card usually carries at most a couple).
      for (const id of card.unreadIds) void markNotificationRead(id);
      // Epic 12: a report notification points at a REPORT, not a job — the
      // Reports screen (root-stack sibling, same navigation the More tab
      // uses). Owner-only: the registry renders report rows generic for
      // technicians, so this branch is unreachable for them — kept as a
      // guard. It loads its own list on focus, so no reports-store arming
      // is needed here.
      if (card.kind === 'report') {
        if (role === 'owner') navigation.navigate('Reports');
        return;
      }
      // Story 14-3: the deep link routes per role — job cards open the
      // viewer for the signed-in role's tree.
      if (role === 'technician') {
        navigation.navigate('TechJobDetail', { jobId: card.jobId });
        return;
      }
      navigation.navigate('JobDetail', { jobId: card.jobId });
    },
    [navigation, markNotificationRead, role],
  );

  // Memoize job IDs to avoid refetch on every render. Report notifications
  // carry jobId null — never a template-lookup target.
  const jobIds = useMemo(
    () => items.flatMap(n => (n.jobId !== null ? [n.jobId] : [])),
    [items],
  );
  // Fetch workflow templates for all notification jobs to display dynamic stages.
  // Also returns an update trigger that fires when templates load.
  const { getTemplate, updateTrigger } = useJobTemplateCache(jobIds);

  // The flat newest-first list becomes one card per job; the stage timeline
  // on each card is derived from that job's own notifications AND the job's
  // stamped workflow template (Story 4.5 dynamic). Rebuild when templates load.
  // Report notifications (jobId null) are skipped by the grouping itself.
  const cards = useMemo(
    () => groupNotificationsByJob(items, getTemplate),
    [items, getTemplate, updateTrigger],
  );
  // Epic 12: report notifications get their own one-card-per-row cards —
  // owner only (the registry renders them generic for technicians).
  const reportCards = useMemo(() => buildReportCards(items, role), [items, role]);
  // Story 14-3: the event-type registry's fallback — unknown event types
  // (later attendance/leave epics) render the inert generic card, one per
  // row, under "All" only. Owner job/report rows are classified exactly as
  // before, so this is additive.
  const genericCards = useMemo(() => buildGenericCards(items, role), [items, role]);
  // Interleaved by recency under "All"; the job buckets (below) stay job-only.
  const listCards = useMemo(
    () => mergeNotificationCards(cards, reportCards, genericCards),
    [cards, reportCards, genericCards],
  );
  const [filter, setFilter] = useState<NotificationFilter>('all');
  // Active/Completed are JOB-status buckets — report and generic
  // notifications show under "All" only and never enter either bucket.
  const visibleCards = useMemo(
    () => (filter === 'all' ? listCards : filterCards(cards, filter)),
    [listCards, cards, filter],
  );
  // Derived through the SAME `filterCards` the list filters with — a drifted
  // card counts as active in both places, and the chips can never disagree
  // with what a filter actually shows. "All" counts every card (jobs +
  // reports + generic).
  const counts = useMemo(
    () => ({
      all: cards.length + reportCards.length + genericCards.length,
      active: filterCards(cards, 'active').length,
      completed: filterCards(cards, 'completed').length,
    }),
    [cards, reportCards, genericCards],
  );

  const renderCard = useCallback(
    ({ item }: { item: NotificationListItem }) =>
      item.kind === 'generic' ? (
        <GenericNotificationCard card={item} />
      ) : (
        <NotificationCard card={item} onPress={handleCardPress} />
      ),
    [handleCardPress],
  );

  const hasData = items.length > 0;
  // A failed load with nothing to show replaces the empty state entirely —
  // "no notifications yet" would be a lie when the request just failed.
  const failedWithNoData = Boolean(error) && !isLoading && !hasData;

  // A failed refresh with rows already on screen: keep the rows, explain why
  // they may be stale (JobsScreen precedent). The dismissal is local — the
  // store's error clears on the next successful load.
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  // A failed mark-read / mark-all: the rows rolled back (or the server was
  // re-asked) — the banner is the only signal, since the list looks normal.
  const [mutationDismissed, setMutationDismissed] = useState(false);
  useEffect(() => {
    setMutationDismissed(false);
  }, [mutationError]);

  const showBanner = Boolean(error) && hasData && !errorDismissed;
  const showMutationError = Boolean(mutationError) && hasData && !mutationDismissed;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          Notifications
        </Text>
        {/* Always rendered once the list has loaded: with nothing unread the
            POST is an idempotent no-op, and hiding the action would invite a
            stale-count trap (a missed live event with unread rows on screen). */}
        <Button
          variant="secondary"
          size="sm"
          onPress={handleMarkAllRead}
          disabled={!hasData}
          leadingIcon={<Check size={16} color={colors.textStrong} strokeWidth={2.5} />}>
          Mark all read
        </Button>
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
          <NotificationFilterBar value={filter} onChange={setFilter} counts={counts} />
          {showBanner ? (
            <View style={styles.bannerWrap}>
              <InlineError message={error ?? ''} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          {showMutationError ? (
            <View style={styles.bannerWrap}>
              <InlineError
                message={mutationError ?? ''}
                onDismiss={() => setMutationDismissed(true)}
              />
            </View>
          ) : null}
          <FlatList
            data={visibleCards}
            keyExtractor={item => item.key}
            renderItem={renderCard}
            onEndReached={() => void loadMoreNotifications()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : undefined // RN 0.87 list types reject `null` here
            }
            // When empty: flexGrow gives the empty state's `flex: 1` a height
            // to centre itself in.
            contentContainerStyle={[
              styles.listContent,
              visibleCards.length === 0 && styles.listContentEmpty,
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
              hasData ? (
                // Rows exist but this filter matches none of them — a quiet
                // line, not the "no notifications yet" empty state (which
                // would lie).
                <Text style={styles.filterEmpty}>
                  {filter === 'active'
                    ? 'No active jobs right now.'
                    : 'No completed jobs yet.'}
                </Text>
              ) : (
                <EmptyState
                  icon={<Bell size={36} color={colors.primary} strokeWidth={1.5} />}
                  title="No notifications yet"
                  description={
                    role === 'technician'
                      ? 'Updates for you will show up here.'
                      : 'Updates from your technicians — job arrivals, progress, completions and report updates — will show up here.'
                  }
                  // Owner-only: the CTA leads to the owner's Jobs TAB; a
                  // technician has no Jobs tab, so the CTA is simply absent.
                  {...(role === 'owner'
                    ? {
                        ctaLabel: 'Go to jobs',
                        // The spec's "CTA back to jobs": navigate to the Jobs
                        // TAB, never `goBack` — from the Home bell that would
                        // land on Home (the CTA would lie about where it goes).
                        onPressCta: () => navigation.navigate('Jobs', { scope: 'today' }),
                      }
                    : {})}
                />
              )
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
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    flex: 1,
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
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.s3,
  },
  filterEmpty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.s4,
  },
});
