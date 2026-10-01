/**
 * AttendanceTabScreen — the technician Attendance tab's single route
 * (Story 15-10): it routes on the access store's state (AD-17/FR-3) and
 * hosts the FR-4 intro gate.
 *
 *   unknown      → a tab-shaped shimmer (the tab itself is hidden in this
 *                  state; this body is the defensive in-between frame).
 *   none         → nothing (the tab cannot normally be focused in this
 *                  state — FR-3: no attendance UI anywhere).
 *   active       → punch card + apply banner + summary card + My month
 *                  banner + Leave history (redesigned 2026-10: My month
 *                  is a NAV banner that pushes the full-screen
 *                  AttendanceMyMonth — the month grid no longer renders
 *                  inline; the header always reads "Attendance", never
 *                  bare "Today", per the UX naming-collision rule).
 *   upcoming     → "Attendance starts on {date}" + summary + Leave (the
 *                  apply row stays the entry here); no check-in control
 *                  (absent, not disabled) and NO My month (an all-zero
 *                  render would read "counted, worked nothing" — absent,
 *                  not disabled).
 *   history_only → the dated ended note (19-6) + the My month banner
 *                  (2026-10: pushes the full screen; the section no
 *                  longer renders inline) + the Leave history (Apply row
 *                  absent — the Apply banner is absent here too).
 *
 * Section mounting stays INSIDE each posture branch — an active↔
 * history_only flip REMOUNTS them (fresh bootstrap), deliberately.
 *
 * Focus refetches access (min-gap shared with the store) so a state flip
 * (upcoming → active, tracked → disabled) lands without a restart. If a
 * refresh returns `none` while THIS tab is focused, the app navigates back
 * to `Today` in the same update — unmounting the focused tab screen must
 * never strand the user on a blank content area (spec finding #9).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CalendarDays, CalendarPlus } from 'lucide-react-native';
import { Button, Skeleton } from '../../../components/ui';
import { colors, fontSize, spacing, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
import { BannerCard } from './BannerCard';
import {
  formatTodaySubtitle,
  formatStartsOnCopy,
  monthChipName,
  shouldShowIntro,
} from './attendanceMeModel';
import {
  refreshAttendanceAccessNow,
  refreshAttendanceAccessOnFocus,
  useAttendanceAccess,
} from './attendanceAccessStore';
import { useAttendanceSummary } from './useAttendanceSummary';
import { AttendanceSummaryView } from './AttendanceSummaryView';
import { AttendanceLeaveSection } from './AttendanceLeaveSection';
import { AttendanceTodayView } from '../today/AttendanceTodayView';
import type { TechnicianTabParamList } from '../../../navigation/types';
import type { TechnicianRootStackParamList } from '../../../navigation/types';

type TabsProps = BottomTabScreenProps<TechnicianTabParamList, 'Attendance'>;
type Props = CompositeScreenProps<
  TabsProps,
  NativeStackScreenProps<TechnicianRootStackParamList>
>;

export default function AttendanceTabScreen({ navigation }: Props) {
  const { status, access } = useAttendanceAccess();
  const accessState = access?.attendanceAccess ?? null;
  const summaryEnabled = accessState === 'active' || accessState === 'upcoming';
  const { state: summaryState, refresh: refreshSummary, refreshNow: refreshSummaryNow } =
    useAttendanceSummary(summaryEnabled);

  // Focus: the store's min-gap decides whether a refetch actually fires.
  useFocusEffect(
    useCallback(() => {
      refreshAttendanceAccessOnFocus();
      return undefined;
    }, []),
  );

  // FR-4 intro gate: active/upcoming and never onboarded → the intro pushes
  // once per TAB ENTRY. "Not now" records nothing, so `shouldShowIntro`
  // stays true — the latch below is what lets the user browse after
  // dismissing: it latches on push and resets only when the TABS navigator
  // state moves off Attendance. That event arrives on the screen's OWN
  // navigation object (a tab screen sees its navigator's state changes);
  // `getParent()` is the ROOT stack here — listening there would see the
  // intro's own push/pop and reset the latch mid-flow, looping "Not now"
  // (BMAD-review HIGH, probe-verified against v7; device-found class).
  const introLatch = useRef(false);
  useEffect(() => {
    return navigation.addListener('state', e => {
      const current = e.data.state.routes[e.data.state.index].name;
      if (current !== 'Attendance') {
        introLatch.current = false;
      }
    });
  }, [navigation]);

  const accessRef = useRef(access);
  accessRef.current = access;
  useFocusEffect(
    useCallback(() => {
      if (shouldShowIntro(accessRef.current) && !introLatch.current) {
        introLatch.current = true;
        navigation.navigate('AttendanceIntro');
      }
    }, [navigation]),
  );

  /** The upcoming screen's early-onboarding CTA — same push, same latch. */
  const openIntro = useCallback(() => {
    introLatch.current = true;
    navigation.navigate('AttendanceIntro');
  }, [navigation]);

  // 17-5 — the Leave section's entry row. `today` is the server's date
  // from the loaded summary (active only — the wire carries no today in
  // the upcoming state), null upstream; the form never derives it.
  const summaryToday = summaryState.summary?.today?.date ?? null;
  const openLeave = useCallback(() => {
    navigation.navigate('LeaveApply', { today: summaryToday });
  }, [navigation, summaryToday]);

  // 19-6 — the check-in BRIDGE's fingerprint: today's date plus the
  // record's instants. A check-in/out mutates the record (the summary
  // refetch lands), and this string changing is the month view's cue to
  // refresh the pane's day map — without it, today's cell reads "Not
  // tracked" seconds after the card above says "Checked in". It now
  // travels INTO the pushed My month screen as a route param (2026-10).
  const todaySignal = summaryState.summary?.today
    ? `${summaryState.summary.today.date}|${summaryState.summary.todayRecord?.checkinAt ?? ''}|${summaryState.summary.todayRecord?.checkoutAt ?? ''}`
    : null;

  /** The My month banner's push — the posture pieces snapshot per push. */
  const openMyMonth = useCallback(() => {
    navigation.navigate('AttendanceMyMonth', {
      attendanceEndedOn: access?.attendanceEndedOn ?? null,
      historyOnly: accessState === 'history_only',
      todaySignal: accessState === 'active' ? todaySignal : null,
    });
  }, [navigation, access, accessState, todaySignal]);

  // A refresh that returns `none` while this tab is focused strands the
  // content area when the tab bar removes the screen — leave for Today
  // in the same update (spec finding #9).
  const wasNonNone = useRef(false);
  useEffect(() => {
    if (accessState !== null && accessState !== 'none') {
      wasNonNone.current = true;
    }
    if (accessState === 'none' && wasNonNone.current && navigation.isFocused()) {
      wasNonNone.current = false;
      navigation.navigate('Today');
    }
  }, [accessState, navigation]);

  // 20-1 pull-to-refresh (AC 15): the tab's two truths — the access gate
  // and the summary card — revalidate together on a pull (the same pair
  // the focus refetch drives), spinner held until the summary settles.
  // A pull while one is in flight is ignored: the latch is a REF, not the
  // spinner state — a same-tick double pull would pass a state guard twice
  // before React re-renders (the same race the write latches guard).
  const [tabRefreshing, setTabRefreshing] = useState(false);
  const tabRefreshingRef = useRef(false);
  const onTabRefresh = useCallback(() => {
    if (tabRefreshingRef.current) return;
    tabRefreshingRef.current = true;
    setTabRefreshing(true);
    AccessibilityInfo.announceForAccessibility('Refreshing attendance');
    refreshAttendanceAccessNow();
    refreshSummaryNow()
      .catch(() => undefined)
      .finally(() => {
        tabRefreshingRef.current = false;
        setTabRefreshing(false);
      });
  }, [refreshSummaryNow]);

  const onRetrySummary = refreshSummary;
  // The header's today line ("Today, Thursday · 12 Oct") and the My month
  // banner's month chip ("October") derive from the WIRE's today, never
  // the device clock.
  const headerTodayLine = formatTodaySubtitle(summaryToday);
  const monthChip = monthChipName(summaryToday);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Attendance
        </Text>
        {headerTodayLine !== null ? (
          <Text style={styles.headerSubtitle} maxFontSizeMultiplier={1.4}>
            {headerTodayLine}
          </Text>
        ) : null}
      </View>
      {status === 'unknown' || accessState === null ? (
        // The access-unknown shimmer, labelled (the 19-5 idiom).
        <View style={styles.skeleton} accessibilityLabel="Loading attendance">
          <Skeleton rows={5} height={56} />
        </View>
      ) : accessState === 'none' ? (
        <View style={styles.center} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={tabRefreshing}
              onRefresh={onTabRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }>
          {accessState === 'history_only' ? (
            <>
              {/* 19-6 D6 — the dated ended note (the {date} is the wire's
                  attendanceEndedOn; a null date — an older BE — degrades
                  to the dateless 15-10 headline). */}
              <View style={styles.endedWrap}>
                <Text style={styles.endedHeadline} accessibilityRole="header">
                  {access?.attendanceEndedOn
                    ? `Attendance tracking ended on ${formatLongDate(access.attendanceEndedOn)}`
                    : 'Attendance tracking has ended'}
                </Text>
                <Text style={styles.endedBody}>
                  You can no longer check in or out, and nothing new is being
                  recorded.
                </Text>
              </View>
              {/* 2026-10 — history_only keeps a live My month (past truth:
                  the bootstrap opens on the ended month) via the banner →
                  the full screen; the Leave history stays BELOW and the
                  Apply entries are absent (subtraction in service of
                  "your record is closed"). */}
              <BannerCard
                tone="primary"
                icon={CalendarDays}
                title="My month"
                chipLabel={null}
                subtitle="Attendance history, calendar & summary"
                onOpen={openMyMonth}
              />
              <AttendanceLeaveSection applyable={false} onApply={openLeave} />
            </>
          ) : (
            <>
              {accessState === 'upcoming' && (
                <View style={styles.upcomingWrap}>
                  <Text style={styles.upcomingHeadline} accessibilityRole="header">
                    {formatStartsOnCopy(access?.attendanceStartDate ?? null) ??
                      'Attendance start scheduled'}
                  </Text>
                  <Text style={styles.upcomingBody}>
                    Here's what's already set up for you.
                  </Text>
                </View>
              )}
              {/* The Today punch section (16-4): active only — upcoming
                  renders no check-in control (absent, not disabled). */}
              {accessState === 'active' && (
                <>
                  <AttendanceTodayView
                    summary={{ state: summaryState, refresh: refreshSummary }}
                    refreshSummaryNow={refreshSummaryNow}
                    refreshAccessNow={refreshAttendanceAccessNow}
                  />
                  {/* 2026-10 — the apply entry became the solid banner
                      (the Leave section's row would be a second door to
                      the same form). */}
                  <BannerCard
                    tone="success"
                    icon={CalendarPlus}
                    title="Apply for leave"
                    chipLabel="Time off"
                    subtitle="Request planned time off or sick leave"
                    onOpen={openLeave}
                  />
                </>
              )}
              <AttendanceSummaryView state={summaryState} onRetry={onRetrySummary} />
              {/* 2026-10 — My month is the banner → the FULL SCREEN
                  (calendar + summary + upcoming holidays + legend live
                  there now); active only, upcoming hides it entirely
                  (an all-zero render would lie). */}
              {accessState === 'active' && (
                <BannerCard
                  tone="primary"
                  icon={CalendarDays}
                  title="My month"
                  chipLabel={monthChip}
                  subtitle="Attendance history, calendar & summary"
                  onOpen={openMyMonth}
                />
              )}
              {/* 17-5 — the Leave section: rendered in active AND upcoming
                  (upcoming can apply; the date floor is server-side). The
                  active Apply row is suppressed — the banner above is the
                  entry now — while upcoming keeps it (no banner there).
                  history_only/none never reach this branch (D1). */}
              <AttendanceLeaveSection
                applyable
                onApply={openLeave}
                showApplyRow={accessState !== 'active'}
              />
              {accessState === 'upcoming' && shouldShowIntro(access) && (
                <Button variant="secondary" size="md" onPress={openIntro}>
                  Finish the intro now
                </Button>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textStrong,
  },
  headerSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  center: {
    flex: 1,
  },
  skeleton: {
    flex: 1,
    padding: spacing.s4,
  },
  upcomingWrap: {
    gap: spacing.s1,
  },
  upcomingHeadline: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textStrong,
  },
  upcomingBody: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  endedWrap: {
    gap: spacing.s2,
    paddingVertical: spacing.s6,
  },
  endedHeadline: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textStrong,
  },
  endedBody: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.45),
    color: colors.textMuted,
  },
});