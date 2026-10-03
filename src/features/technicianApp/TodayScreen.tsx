/**
 * TodayScreen — the technician's "Today" tab: greeting + their assigned
 * jobs for the day, grouped into IN PROGRESS / SCHEDULED / DONE TODAY
 * sections (empty sections omitted; Done today stays visible when
 * non-empty — honest day count, deliberate product behaviour).
 *
 * Data comes from `useTechnicianJobs` (GET /jobs, server-scoped to the
 * caller) — the same store History reads, so the two tabs can never
 * disagree. Cards are the JobCard technician variant: no footer (the
 * technician is themselves) and no customer name (list rows don't carry
 * one pre-sync — the service-type label is the title line).
 *
 * The header bell (Story 14-3) is the technician's notifications entry
 * point — visible from day one regardless of attendance/tracked status
 * (FR-27): same IconButton + unread badge as the owner's Jobs-header bell,
 * opening the shared notifications screen. The unread count comes from the
 * same `useNotifications` store, refetched on focus.
 *
 * No earnings card, no jobs-left count, no date strip — those all need
 * backend support (payments, a jobs-left computation, multi-day job data)
 * that doesn't exist yet; adding them now would just be UI over no data.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bell, CalendarCheck, Plus, RefreshCw } from 'lucide-react-native';
import { Button, EmptyState, Eyebrow, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { useNow } from '../../hooks';
import { greetingForNow } from '../../utils';
import { firstName, useMyProfile } from '../profile';
import { JobCard } from '../jobs/components/JobCard';
import { loadUnreadCount, useNotifications } from '../notifications';
import { bellBadgeLabel } from '../notifications/bellBadge';
import {
  refreshAttendanceAccessNow,
  useAttendanceAccess,
} from '../attendance/me/attendanceAccessStore';
import { useAttendanceSummary } from '../attendance/me/useAttendanceSummary';
import { PunchSection } from '../attendance/today/PunchSection';
import type { ApiJob } from '../jobs/types';
import { buildTodaySections } from './todaySections';
import { loadToday, useTechnicianJobs } from './useTechnicianJobs';
import type { TechnicianRootStackParamList } from '../../navigation/types';

export default function TodayScreen() {
  const { profile } = useMyProfile();
  const { today, isLoadingToday, errorToday, hasLoadedToday, refreshToday } =
    useTechnicianJobs();
  // Story 14-3: the bell badge — same shared store the owner's bells read.
  const { unreadCount } = useNotifications();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>();

  // Story 20-3: the punch lives HERE now. The access store gates it (an
  // employee without `active` sees nothing new on this tab — no header, no
  // summary fetch, no location work); the summary hook is per-mount and
  // min-gap throttled (its second mount on the Attendance tab is accepted).
  const { access } = useAttendanceAccess();
  const accessState = access?.attendanceAccess ?? null;
  const punchEnabled = accessState === 'active';
  const {
    state: punchSummaryState,
    refresh: refreshPunchSummary,
    refreshNow: refreshPunchSummaryNow,
  } = useAttendanceSummary(punchEnabled);
  // Bumped by pull-to-refresh: the punch's own re-probe (a pull refreshes
  // the whole screen — jobs, summary AND the fence), not just the list.
  const [punchRefreshTick, setPunchRefreshTick] = useState(0);

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next attempt).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [errorToday]);

  // Refetch on every focus — the store throttles (skips within 15s of a
  // success), so tab-hopping and returning from a completed job stay cheap.
  // The bell's unread count rides the same focus pass (its own TTL).
  useFocusEffect(
    useCallback(() => {
      void loadToday();
      void loadUnreadCount();
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // One pull, three truths: the day's jobs, the punch's summary inputs
    // (office pin/record — the fence reads them) and the fence probe itself.
    setPunchRefreshTick(tick => tick + 1);
    if (punchEnabled) void refreshPunchSummaryNow().catch(() => undefined);
    await refreshToday();
    setIsRefreshing(false);
  }, [refreshToday, punchEnabled, refreshPunchSummaryNow]);

  const handleOpenJob = useCallback(
    (job: ApiJob) => {
      navigation.navigate('TechJobDetail', { jobId: job.id });
    },
    [navigation],
  );

  const handleOpenNotifications = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  const sections = buildTodaySections(today);
  // The urgency rail's clock — one 60s tick for the sectioned list.
  const now = useNow();
  // `name` is nullable on the wire (see `MyProfile`); the greeting falls back
  // to a nameless form when it's missing.
  const name = firstName(profile?.name ?? null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting} numberOfLines={1}>
          {name ? `${greetingForNow()}, ${name}` : greetingForNow()}
        </Text>
        <IconButton
          variant="ghost"
          size="md"
          label="Notifications"
          onPress={handleOpenNotifications}>
          <Bell size={22} color={colors.textStrong} strokeWidth={2} />
          {unreadCount !== null && unreadCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{bellBadgeLabel(unreadCount)}</Text>
            </View>
          ) : null}
        </IconButton>
      </View>

      {isLoadingToday && !hasLoadedToday ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : errorToday && !hasLoadedToday ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={errorToday} />
          <Button variant="secondary" size="md" onPress={() => void refreshToday()}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* A failed refresh with rows already on screen: keep the rows,
              explain why they may be stale. */}
          {errorToday && hasLoadedToday && !errorDismissed ? (
            <View style={styles.bannerWrap}>
              <InlineError message={errorToday} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <JobCard job={item} urgencyNow={now} showFooter={false} onPress={handleOpenJob} />
          )}
          renderSectionHeader={({ section }) => (
            <Eyebrow style={styles.sectionHeaderSpacing}>
              {section.title}
            </Eyebrow>
          )}
          // The punch rides ABOVE the job sections (the 20-3 AC) — as the
          // list header it scrolls with the day, and its loading/error
          // postures are the section's own.
          ListHeaderComponent={
            punchEnabled ? (
              <View style={styles.punchWrap}>
                <PunchSection
                  summary={{ state: punchSummaryState, refresh: refreshPunchSummary }}
                  refreshSummaryNow={refreshPunchSummaryNow}
                  refreshAccessNow={refreshAttendanceAccessNow}
                  refreshTick={punchRefreshTick}
                />
              </View>
            ) : undefined
          }
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              testID="today-refresh"
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarCheck size={36} color={colors.primary} strokeWidth={1.5} />}
              title="No job assigned yet"
              description="Your owner hasn't assigned you any jobs for today. Check back soon."
              // The 20-3 mockup's empty state: rounded-square medallion with
              // the + badge, and the sync pill on the screen's own refresh
              // path. Additive props only — every other screen's render is
              // untouched.
              medallionShape="square"
              badge={
                <View style={styles.medallionBadge}>
                  <Plus size={14} color={colors.onPrimary} strokeWidth={2.6} />
                </View>
              }
              ctaShape="pill"
              ctaLabel="Tap to refresh"
              ctaIcon={<RefreshCw size={16} color={colors.primary} strokeWidth={2.2} />}
              onPressCta={() => void handleRefresh()}
            />
          }
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
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  greeting: {
    ...typography.title,
    fontSize: 24,
    color: colors.textStrong,
    flexShrink: 1,
  },
  // The bell badge — same pill as the owner's Jobs-header bell
  // (JobsScreen styles are the reference; tokens only).
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    ...typography.captionStrong,
    color: colors.onPrimary,
  },
  // The eyebrow treatment itself (type, tracking, caps, muted) lives in the
  // DS `Eyebrow` — this only positions it inside the list.
  sectionHeaderSpacing: {
    paddingVertical: spacing.s2,
  },
  // The punch block's breathing room between the header and the job list.
  punchWrap: {
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  // The empty-state medallion's corner badge (20-3 mockup): blue disc with
  // a page-coloured ring so it reads as overlaid on the tinted chip.
  medallionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.s4,
    paddingTop: 0,
  },
  listContentEmpty: {
    flexGrow: 1,
    // When empty: flexGrow gives EmptyState's `flex: 1` a height to centre
    // itself in, and the list padding drops away since EmptyState brings its
    // own horizontal inset.
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
});
