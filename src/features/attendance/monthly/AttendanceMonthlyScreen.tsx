/**
 * AttendanceMonthlyScreen — the FR-25 owner monthly view (Story 19-5 D4):
 * the month-end review — a per-employee summary list with the office
 * filter, tapping through to that employee's month calendar. Strictly a
 * read-only renderer: the BE engine's aggregation is the single source
 * (FR-11) and the FE renders the envelope, never recomputes.
 *
 * Postures (spec D4/D8/D9):
 *   - ONE monthly fetch per appearance: `useFocusEffect` performs the
 *     fetch, so the FIRST FOCUS IS THE INITIAL LOAD; every later focus /
 *     AppState-`active` refetches silently in place (latest-wins).
 *   - First load → the DS `Skeleton`, row-shaped at the row's own height
 *     (the swap doesn't jump), labelled "Loading attendance".
 *   - A parameter/focus load failure keeps the last-good rows and
 *     surfaces the fixed copy + Retry BELOW the list; a failed office
 *     pick / month switch reverts the {month, office} PAIR (the engine's
 *     seam).
 *   - Month nav: ‹ unbounded past (FR-25), › disabled-until-known (the
 *     wire `today` gates it — the day-statuses route does NOT 422 a
 *     future month) and disabled AT the current month; both chevrons
 *     render disabled while a PARAMETER load is in flight (the
 *     acknowledgment AND the race guard). A parameter load (month
 *     switch / office pick) answers with the row Skeleton — the user's
 *     2026-09-30 direction ("can we add some loader while the data is
 *     fetching"), superseding Q5's silent swap; focus/AppState
 *     refetches stay silent in-place.
 *   - `employees.length === 0` → the EmptyState inside the plain
 *     ScrollView (dashboard parity) — no "yet": ‹ is unbounded, a past
 *     month will never fill in.
 *
 * The wire's `today` echo drives the month bounds + the fetch clamp (the
 * model's monthlyWindow) — the FE never derives it from the device clock.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, Skeleton } from '../../../components/ui';
import { colors, fontSize, radius, spacing, weight } from '../../../theme';
import type { RootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../offices/ScreenHeader';
import { WorkspaceSelector } from '../dashboard/WorkspaceSelector';
import { OfficeFilterSheet } from '../dashboard/OfficeFilterSheet';
import { LoadErrorRetry } from '../dashboard/LoadErrorRetry';
import { MonthlyEmployeeRow, ROW_HEIGHT } from './MonthlyEmployeeRow';
import { monthTitle } from './monthlyModel';
import { MONTHLY_ERROR_COPY, useMonthlyData } from './useMonthlyData';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceMonthly'>;

/** The skeleton stands in for SIX rows at the row's real height — the
 *  swap doesn't jump (the container gap matches the rows' gap). */
const SKELETON_ROWS = 6;

export default function AttendanceMonthlyScreen({ navigation }: Props) {
  // Back that works from anywhere (the AttendanceHome goBackSafely idiom).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // The load/refetch engine + postures + the pair-revert seam (D4).
  const {
    data,
    hasSettled,
    firstLoadError,
    refetchError,
    paramLoading,
    yearMonth,
    pickedOffice,
    load,
    shiftMonth,
    onPickOffice,
  } = useMonthlyData();

  // 20-1 AC 15 (review 2026-10-01, user call): the monthly review carries
  // pull-to-refresh like every other attendance surface — `load` (not a
  // parameter load: no skeleton flash, rows stay up, the AC 14 posture).
  // Same-tick double pull is inert through the ref latch.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    AccessibilityInfo.announceForAccessibility('Refreshing attendance');
    try {
      await load();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [load]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  // The ONE fetch per appearance: the first focus IS the initial load.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // AppState-active refetch (the useCheckInOut idiom), gated to focus —
  // a foregrounding while this screen is deep in the stack is not an
  // appearance.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active' && navigation.isFocused()) void load();
    });
    return () => {
      // Some environments (jest's RN preset) return no subscription.
      sub?.remove();
    };
  }, [load, navigation]);

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // › is disabled-until-known (never enabled-and-unbounded — the
  // day-statuses route does NOT 422 a future range) and disabled AT the
  // current month; ‹ is unbounded past. BOTH render disabled while a
  // PARAMETER load is in flight (Q5 — the acknowledgment AND the race
  // guard); silent focus/AppState refetches leave them alone.
  const today = data?.today ?? null;
  const nextDisabled = today === null || yearMonth === today.slice(0, 7);
  const navDisabled = paramLoading;

  // First load AND parameter loads (month switch / office pick — the
  // user's 2026-09-30 loader direction) stand in the row Skeleton; the
  // silent focus/AppState refetches swap rows in place instead.
  const showSkeleton = (data === null && !hasSettled) || paramLoading;
  const employees = paramLoading ? null : (data?.employees ?? null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Monthly" onBack={goBackSafely} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}>
        {/* The office filter — static chrome, renders in every posture.
            officesCount null: NO Sites pill (Q2 — the pill costs a standing
            second fetch and adds nothing to a month-end review). */}
        <WorkspaceSelector
          label={pickedOffice ? pickedOffice.name : 'All offices'}
          officesCount={null}
          onPress={() => setFilterSheetVisible(true)}
        />

        {/* Month nav — the host furniture the pane also renders (ONE
            monthTitle table in the model); 44×44 pill buttons. */}
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: navDisabled }}
            disabled={navDisabled}
            onPress={() => shiftMonth(-1)}
            style={styles.navButton}>
            <ChevronLeft size={20} color={colors.textBody} strokeWidth={2} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthTitle(yearMonth)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: navDisabled || nextDisabled }}
            disabled={navDisabled || nextDisabled}
            onPress={() => shiftMonth(1)}
            style={styles.navButton}>
            <ChevronRight size={20} color={colors.textBody} strokeWidth={2} />
          </Pressable>
        </View>

        {showSkeleton ? (
          // Row-shaped placeholders at the row's real height, labelled —
          // the skeleton is not silent to screen readers (D4).
          <View accessibilityLabel="Loading attendance">
            <Skeleton rows={SKELETON_ROWS} height={ROW_HEIGHT} />
          </View>
        ) : null}

        {data === null && firstLoadError !== null ? (
          <LoadErrorRetry
            message={MONTHLY_ERROR_COPY}
            onRetry={() => void load()}
          />
        ) : null}

        {employees !== null ? (
          employees.length === 0 ? (
            // No "yet": ‹ is unbounded, so a past month will never fill in.
            <EmptyState
              icon={
                <Users size={26} color={colors.status.neutral.fg} strokeWidth={1.5} />
              }
              title="No attendance to review"
              description="No one has tracked days in this month. Try another month or office."
            />
          ) : (
            <View style={styles.rows}>
              {employees.map(row => (
                <MonthlyEmployeeRow
                  key={row.employeeId}
                  row={row}
                  onPress={() =>
                    navigation.navigate('AttendanceEmployeeMonth', {
                      employeeId: row.employeeId,
                      employeeName: row.employeeName,
                      yearMonth,
                    })
                  }
                />
              ))}
            </View>
          )
        ) : null}

        {data !== null && refetchError && !paramLoading ? (
          // The last-good rows stay above; this explains why they may be
          // stale — BELOW the list (the InlineError contract). Hidden
          // while a parameter load's skeleton stands in (its own failure
          // path re-shows it after the revert).
          <LoadErrorRetry
            message={MONTHLY_ERROR_COPY}
            onRetry={() => void load()}
          />
        ) : null}
      </ScrollView>

      {/* The dashboard's sheet REUSED with stats={null} — its own
          officesService.list() fallback owns the loading/failed postures
          verbatim (name-only rows, no tallies fabricated; D5). */}
      <OfficeFilterSheet
        visible={filterSheetVisible}
        selected={pickedOffice ? pickedOffice.id : null}
        stats={null}
        onPick={office => {
          onPickOffice(office);
          setFilterSheetVisible(false);
        }}
        onClose={() => setFilterSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  monthLabel: {
    fontSize: fontSize.base,
    fontWeight: weight.semibold,
    color: colors.textStrong,
  },
  rows: {
    gap: spacing.s3,
  },
});
