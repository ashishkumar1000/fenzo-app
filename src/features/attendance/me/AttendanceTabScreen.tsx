/**
 * AttendanceTabScreen — the technician Attendance tab's single route
 * (Story 15-10): it routes on the access store's state (AD-17/FR-3) and
 * hosts the FR-4 intro gate.
 *
 *   unknown      → centered spinner (the tab itself is hidden in this
 *                  state; this body is the defensive in-between frame).
 *   none         → nothing (the tab cannot normally be focused in this
 *                  state — FR-3: no attendance UI anywhere).
 *   active       → summary screen (NO check-in control in this story —
 *                  Epic 16 owns it; the header always reads "Attendance",
 *                  never bare "Today", per the UX naming-collision rule).
 *   upcoming     → "Attendance starts on {date}" + summary + the early
 *                  onboarding CTA; no check-in control (absent, not
 *                  disabled).
 *   history_only → ended banner only (no office rows exist for this state;
 *                  records surfaces are Epics 18/19).
 *
 * Focus refetches access (min-gap shared with the store) so a state flip
 * (upcoming → active, tracked → disabled) lands without a restart. If a
 * refresh returns `none` while THIS tab is focused, the app navigates back
 * to `Today` in the same update — unmounting the focused tab screen must
 * never strand the user on a blank content area (spec finding #9).
 */
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../../components/ui';
import { colors, fontSize, spacing } from '../../../theme';
import {
  refreshAttendanceAccessNow,
  refreshAttendanceAccessOnFocus,
  useAttendanceAccess,
} from './attendanceAccessStore';
import { useAttendanceSummary } from './useAttendanceSummary';
import { AttendanceSummaryView } from './AttendanceSummaryView';
import { AttendanceTodayView } from '../today/AttendanceTodayView';
import {
  formatStartsOnCopy,
  shouldShowIntro,
} from './attendanceMeModel';
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

  const onRetrySummary = refreshSummary;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Attendance
        </Text>
      </View>
      {status === 'unknown' || accessState === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : accessState === 'none' ? (
        <View style={styles.center} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {accessState === 'history_only' ? (
            <View style={styles.endedWrap}>
              <Text style={styles.endedHeadline} accessibilityRole="header">
                Attendance tracking has ended
              </Text>
              <Text style={styles.endedBody}>
                You can no longer check in or out, and nothing new is being
                recorded.
              </Text>
            </View>
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
              {/* The Today check-in section (16-4): active only — upcoming
                  renders no check-in control (absent, not disabled). */}
              {accessState === 'active' && (
                <AttendanceTodayView
                  summary={{ state: summaryState, refresh: refreshSummary }}
                  refreshSummaryNow={refreshSummaryNow}
                  refreshAccessNow={refreshAttendanceAccessNow}
                />
              )}
              <AttendanceSummaryView state={summaryState} onRetry={onRetrySummary} />
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
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
