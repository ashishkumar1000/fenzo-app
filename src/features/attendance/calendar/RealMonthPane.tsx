/**
 * RealMonthPane — the PRODUCTION month pane (Story 19-5 D6): one
 * employee's month nav + the live `useMonthStatuses` grid over real data.
 * 19-5's drill-down host (AttendanceEmployeeMonthScreen) embeds it
 * owner-scoped; the dev Component-lab screen keeps hosting it unchanged
 * (it retires with 19-6). 19-6's self view embeds the same pane me-scoped.
 *
 * Data ownership stays in the pane; the parent (which owns only the
 * picked day + the sheet wiring) receives a RealMonthReport — the rows,
 * the wire `today` echo (the 18-4 D1 gate input) and the stable
 * non-clearing `refresh` handle (D5).
 *
 * 19-5's three patches (D6): the `nextDisabled` prop (the host passes
 * `today == null || yearMonth === today.slice(0,7)` — the day-statuses
 * route does NOT 422 a future range, so a future month would be a silent
 * all-not_tracked grid; the lab passes nothing — unchanged behaviour); nav
 * buttons 44×44 `radius.pill` (the pane's 40×40 was below `touch.min`);
 * and the EMPTY-GRID GATE — `runFetch` clears the map on every month
 * change, so the pane gates `<MonthCalendar>` on
 * `data.size > 0 || (!loading && error == null)`: first load and switches
 * show the spinner only (no flash of a full month of "didn't work"
 * cells), a first-load error shows error + Retry with no ghost grid, an
 * honest empty month still renders the grid (that IS the truth — the
 * all-neutral grid is the calendar's own empty state), and a
 * refresh-error-with-rows keeps the grid (`refresh()` never clears).
 *
 * The foreground refetch (D1): the correction gate is data-driven and
 * refetch-fresh ONLY — a backgrounded host refetches on return so a day
 * aging into correctability appears without a remount (the useCheckInOut
 * AppState idiom).
 */
import { useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, fontSize, radius, spacing, weight } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { useMonthStatuses } from './useMonthStatuses';
import { MonthCalendar } from './MonthCalendar';
import { monthTitle } from '../monthly/monthlyModel';

/** The parent's sheet inputs, reported up on every data change. 19-5 D6
 *  adds `loading`: the host suppresses day picks while a month load is in
 *  flight (a cleared map must not mint false "Not tracked" sheets). */
export interface RealMonthReport {
  days: ReadonlyMap<string, DayStatusRow>;
  today: string | null;
  loading: boolean;
  refresh: () => void;
}

export function RealMonthPane({
  employeeId,
  yearMonth,
  onShiftMonth,
  onPickDay,
  onData,
  nextDisabled = false,
}: {
  employeeId: string;
  yearMonth: string;
  onShiftMonth: (delta: number) => void;
  onPickDay: (workDate: string) => void;
  onData: (report: RealMonthReport) => void;
  /** 19-5 D6: the host's › bound (`today == null || yearMonth ===
   *  today.slice(0,7)`) — disabled-until-known on the drill-down; the
   *  lab passes nothing (unchanged behaviour). */
  nextDisabled?: boolean;
}) {
  const month = useMonthStatuses({
    scope: { kind: 'owner', employeeId },
    yearMonth,
  });

  // Report the rows up for the parent's sheet (an effect, never a render
  // side-effect; refresh is a stable useCallback).
  useEffect(() => {
    onData({
      days: month.data,
      today: month.today,
      loading: month.loading,
      refresh: month.refresh,
    });
  }, [onData, month.data, month.today, month.loading, month.refresh]);

  // D1: the gate is refetch-fresh only — foreground refetches (some
  // environments' jest preset return no subscription, hence the ?).
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') month.refresh();
    });
    return () => sub?.remove();
  }, [month.refresh]);

  // The empty-grid gate (Sally Q6): the map is CLEARED on every month
  // change, so the grid renders only when there are rows — or when the
  // month settled without error (an honest empty month's all-neutral
  // grid IS the calendar's own empty state).
  const showGrid = month.data.size > 0 || (!month.loading && month.error == null);

  return (
    <>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onShiftMonth(-1)}
          style={styles.navButton}>
          <ChevronLeft size={20} color={colors.textBody} strokeWidth={2} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthTitle(yearMonth)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={() => onShiftMonth(1)}
          style={styles.navButton}>
          <ChevronRight size={20} color={colors.textBody} strokeWidth={2} />
        </Pressable>
      </View>
      {month.loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      ) : null}
      {month.error != null ? (
        <>
          <InlineError message={month.error} />
          <Button variant="secondary" size="sm" onPress={month.retry}>
            Retry
          </Button>
        </>
      ) : null}
      {showGrid ? (
        <MonthCalendar
          yearMonth={yearMonth}
          days={month.data}
          today={month.today}
          onPickDate={onPickDay}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  spinner: {
    paddingVertical: spacing.s3,
  },
});
