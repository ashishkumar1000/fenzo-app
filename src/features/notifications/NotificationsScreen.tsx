/**
 * NotificationsScreen — the owner's notification history (Story 3.4).
 *
 * A full-screen root-stack route (sibling of JobDetail — covers the tab
 * bar), opened from either bell (Jobs header, Home header). Newest-first
 * cursor-paginated list over the `useNotifications` shared store: loads on
 * focus (TTL-throttled in the store), pages in on scroll-end, pulls to
 * refresh, and carries the "Mark all read" action in its header.
 *
 * Tapping a row is NAVIGATE-FIRST: the deep link to that job's JobDetail is
 * the user's intent; the optimistic mark-read is cosmetic and happens
 * alongside it (read rows still navigate — no POST, no rollback ceremony).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Bell } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
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
import { NotificationRow } from './components/NotificationRow';
import type { ApiNotification } from '../../services';

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

  const handleRowPress = useCallback(
    (notification: ApiNotification) => {
      // Navigate first — the deep link is the user's intent and must not
      // wait on the mark-read POST. Read-state is cosmetic (handled
      // optimistically inside the store, with its own rollback).
      void markNotificationRead(notification.id);
      navigation.navigate('JobDetail', { jobId: notification.jobId });
    },
    [navigation, markNotificationRead],
  );

  const renderRow = useCallback(
    ({ item }: { item: ApiNotification }) => (
      <NotificationRow notification={item} onPress={handleRowPress} />
    ),
    [handleRowPress],
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
          disabled={!hasData}>
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
            data={items}
            keyExtractor={item => item.id}
            renderItem={renderRow}
            onEndReached={() => void loadMoreNotifications()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
            }
            // When empty: flexGrow gives EmptyState's `flex: 1` a height to
            // centre itself in.
            contentContainerStyle={[styles.listContent, !hasData && styles.listContentEmpty]}
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
});
