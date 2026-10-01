/**
 * AttendanceMyMonthScreen — the full-screen "My month" host (the 2026-10
 * tab redesign): the tab's inline month section moves onto its OWN
 * screen, opened from the tab's "My month" banner. The screen hosts the
 * EXISTING AttendanceMyMonth section component verbatim (the bootstrap,
 * echo correction, bridge and day sheet all live there — nothing is
 * reimplemented here) plus the day-status legend the inline section never
 * had (2026-10).
 *
 * State travels as ROUTE PARAMS from the tab at push time
 * (`AttendanceMyMonthParams`): the posture pieces (`historyOnly`,
 * `attendanceEndedOn`, the `todaySignal` bridge fingerprint) snapshot
 * once per push. That is deliberate — the section remounts and
 * re-bootstraps like any posture flip, so every entry opens fresh; a
 * tab-side state flip while this screen is open re-lands on the tab's
 * next focus (the tab refetches access on focus and re-renders), not
 * inside this pushed screen.
 */
import { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../../theme';
import ScreenHeader from '../offices/ScreenHeader';
import { DayStatusLegend } from '../calendar/DayStatusLegend';
import { AttendanceMyMonth } from './AttendanceMyMonth';
import type { AttendanceMyMonthHandle } from './AttendanceMyMonth';
import type { TechnicianRootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'AttendanceMyMonth'>;

export default function AttendanceMyMonthScreen({ navigation, route }: Props) {
  const { attendanceEndedOn = null, historyOnly = false, todaySignal = null } = route.params ?? {};

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  // 20-1 pull-to-refresh (AC 14): the section reports its combined
  // non-clearing refresh through the handle; the spinner holds until BOTH
  // truths settle. A pull while one is in flight is ignored (the truths
  // are already revalidating — no extra GET stack).
  const monthRef = useRef<AttendanceMyMonthHandle | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The latch is a REF, not the spinner state — a same-tick double pull
  // would pass a state guard twice before React re-renders.
  const refreshingRef = useRef(false);
  const onRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    AccessibilityInfo.announceForAccessibility('Refreshing attendance');
    // The handle is captured, not short-circuited into an optional chain:
    // `monthRef.current?.refresh().catch().finally()` would SKIP the whole
    // chain when the handle is null (a remount's gap) and strand the latch
    // and the spinner forever.
    const handle = monthRef.current;
    const settle =
      handle != null
        ? handle.refresh().catch(() => undefined)
        : Promise.resolve();
    void settle.finally(() => {
      refreshingRef.current = false;
      setRefreshing(false);
    });
  }, []);

  // The day sheet's "Apply leave" (2026-10): leave is an ACTIVE-posture
  // move — history_only leaves the CTA undefined (nothing renders). The
  // picker route carries `prefillDate` = the tapped day and the section's
  // canonical today (the form's ONE clock — the sheet applies for a date
  // the tenant's wire, not the device, calls today-ish).
  const onApplyLeave = useCallback(
    (workDate: string, canonicalToday: string | null) => {
      navigation.navigate('LeaveApply', {
        today: canonicalToday,
        prefillDate: workDate,
      });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="My month" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        <AttendanceMyMonth
          ref={monthRef}
          attendanceEndedOn={attendanceEndedOn}
          historyOnly={historyOnly}
          todaySignal={todaySignal}
          showHead={false}
          onApplyLeave={historyOnly ? undefined : onApplyLeave}
        />
        <DayStatusLegend />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
});