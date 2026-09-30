/**
 * RealMonthPane — the ComponentLab's real-data month (Story 18-3 D7,
 * hosted by the __DEV__-gated lab screen): employee-driven month nav +
 * the live `useMonthStatuses` grid over production data.
 *
 * Data ownership stays in the pane; the parent (which owns only the
 * picked day + the sheet wiring) receives a RealMonthReport — the rows,
 * the wire `today` echo (the 18-4 D1 gate input) and the stable
 * non-clearing `refresh` handle (D5).
 *
 * The foreground refetch (D1): the correction gate is data-driven and
 * refetch-fresh ONLY — a backgrounded lab refetches on return so a day
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
import { colors, fontSize, spacing, weight } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { useMonthStatuses } from './useMonthStatuses';
import { MonthCalendar } from './MonthCalendar';

/** The parent's sheet inputs, reported up on every data change. */
export interface RealMonthReport {
  days: ReadonlyMap<string, DayStatusRow>;
  today: string | null;
  refresh: () => void;
}

/** 'YYYY-MM' → "September 2026". */
function monthTitle(yearMonth: string): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;
}

export function RealMonthPane({
  employeeId,
  yearMonth,
  onShiftMonth,
  onPickDay,
  onData,
}: {
  employeeId: string;
  yearMonth: string;
  onShiftMonth: (delta: number) => void;
  onPickDay: (workDate: string) => void;
  onData: (report: RealMonthReport) => void;
}) {
  const month = useMonthStatuses({
    scope: { kind: 'owner', employeeId },
    yearMonth,
  });

  // Report the rows up for the parent's sheet (an effect, never a render
  // side-effect; refresh is a stable useCallback).
  useEffect(() => {
    onData({ days: month.data, today: month.today, refresh: month.refresh });
  }, [onData, month.data, month.today, month.refresh]);

  // D1: the gate is refetch-fresh only — foreground refetches (some
  // environments' jest preset return no subscription, hence the ?).
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') month.refresh();
    });
    return () => sub?.remove();
  }, [month.refresh]);

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
      <MonthCalendar
        yearMonth={yearMonth}
        days={month.data}
        today={month.today}
        onPickDate={onPickDay}
      />
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
