/**
 * NotificationsScreen — the owner's notification history (Story 3.4,
 * redesigned 2026-09).
 *
 * A full-screen root-stack route (sibling of JobDetail — covers the tab
 * bar), opened from either bell (Jobs header, Home header). Newest-first
 * cursor-paginated list over the `useNotifications` shared store: loads on
 * focus (TTL-throttled in the store), pages in on scroll-end, pulls to
 * refresh, and carries the "Mark all read" action in its header.
 *
 * The redesign renders one CARD per job (grouped client-side from the flat
 * list by `notificationCardModel.ts` — the card's stage timeline comes from
 * that job's own notifications, no extra API calls) behind an All / Active /
 * Completed filter chip row.
 *
 * Tapping a card is NAVIGATE-FIRST: the deep link to that job's JobDetail is
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
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';
import {
  loadMoreNotifications,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from './useNotifications';
import { NotificationCard } from './components/NotificationCard';
import { NotificationFilterBar } from './components/NotificationFilterBar';
import { filterCards, groupNotificationsByJob } from './notificationCardModel';
import type { NotificationCardData, NotificationFilter } from './notificationCardModel';

/**
 * Mostly a plain root-stack screen, but the empty state's "Go to jobs" CTA
 * navigates to the Jobs TAB (a nested route) — hence the composite props,
 * the same shape JobsScreen uses in mirror image.
 */
type Props = CompositeScreenProps<
  NativeStackScreenProps<RootStackParamList, 'Notifications'>,
  BottomTabScreenProps<MainTabParamList>
>;

export default function NotificationsScreen({ navigation }: Props) {
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
    (card: NotificationCardData) => {
      // Navigate first — the deep link is the user's intent and must not
      // wait on the mark-read POST. Read-state is cosmetic (handled
      // optimistically inside the store, with its own rollback). Opening a
      // job's card settles ALL of its unread events (the POSTs are
      // idempotent; a card usually carries at most a couple).
      for (const id of card.unreadIds) void markNotificationRead(id);
      navigation.navigate('JobDetail', { jobId: card.jobId });
    },
    [navigation, markNotificationRead],
  );

  // The flat newest-first list becomes one card per job; the stage timeline
  // on each card is derived from that job's own notifications (no extra
  // API calls). Filtering happens client-side over the loaded cards.
  const cards = useMemo(() => groupNotificationsByJob(items), [items]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const visibleCards = useMemo(() => filterCards(cards, filter), [cards, filter]);
  // Derived through the SAME `filterCards` the list filters with — a drifted
  // card counts as active in both places, and the chips can never disagree
  // with what a filter actually shows.
  const counts = useMemo(
    () => ({
      all: cards.length,
      active: filterCards(cards, 'active').length,
      completed: filterCards(cards, 'completed').length,
    }),
    [cards],
  );

  const renderCard = useCallback(
    ({ item }: { item: NotificationCardData }) => (
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
            keyExtractor={item => item.jobId}
            renderItem={renderCard}
            onEndReached={() => void loadMoreNotifications()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
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
                  description="Updates from your technicians — job arrivals, progress and completions — will show up here."
                  ctaLabel="Go to jobs"
                  // The spec's "CTA back to jobs": navigate to the Jobs TAB,
                  // never `goBack` — from the Home bell that would land on
                  // Home (the CTA would lie about where it goes).
                  onPressCta={() => navigation.navigate('Jobs', { scope: 'today' })}
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
