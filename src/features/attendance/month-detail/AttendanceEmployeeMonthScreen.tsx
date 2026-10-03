/**
 * AttendanceEmployeeMonthScreen — the drill-down to one employee's month
 * calendar (Story 19-5 D6): ScreenHeader(employeeName) + RealMonthPane —
 * the Epic-18 component's first PRODUCTION host. The pane owns the data
 * (useMonthStatuses inside it — the host never fetches); the host owns
 * the `yearMonth` state (init from params — the params are always
 * echo-derived at the call sites), the `nextDisabled` computation from
 * the pane's wire `today` (the day-statuses route does NOT 422 a future
 * range, so › is disabled-until-known and disabled AT the current month),
 * and the DayDetailSheet wiring (the 18-4 write, identical to the lab's
 * real-month wiring; UJ-4's climax: the Correction → refresh → summary
 * updates loop).
 *
 * The `focusDate` deep-link arrival (D7) arms on mount and fires ONCE on
 * the first SUCCESSFUL data landing (a failed first load leaves it armed
 * — the Retry's success fires it); it no-ops after a manual pick and
 * opens only when the focus date's row exists (a missing row = flag
 * cleared or day untracked → a silent calendar landing). The sheet's
 * `visible` flips only post-resolution, so DayDetailSheet's own
 * "Day detail, «date»" announce fires exactly once over real content.
 *
 * Loading-month taps are IGNORED (a cleared map must not mint false
 * "Not tracked" day sheets — U10). The params pair is normalized once:
 * a `focusDate` outside `yearMonth` is dev-warned and treated as absent.
 *
 * header + month nav + pane + legend + day sheet is complete (the legend
 * joined 2026-10 so the calendar's marks explain themselves). No focus
 * refetch:
 * the pane's own AppState-active refresh covers foregrounding, and
 * returning from a pushed screen needs none (the sheet, not a route,
 * does the writes).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../../theme';
import type { RootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../offices/ScreenHeader';
import {
  RealMonthPane,
  type RealMonthReport,
} from '../calendar/RealMonthPane';
import { DayStatusLegend } from '../calendar/DayStatusLegend';
import { DayDetailSheet } from '../calendar/DayDetailSheet';
import { shiftYearMonth } from '../monthly/monthlyModel';
import { correctDay } from '../../../services/resources/attendanceCorrections';
import type { CorrectionWriteBody } from '../../../services/resources/attendanceCorrections';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceEmployeeMonth'>;

/**
 * D6's pair normalization: `focusDate` is trusted only when it is a
 * `YYYY-MM-DD` INSIDE `yearMonth` — a mismatched pair (dev-warned once on
 * mount) is treated as absent.
 */
function normalizeFocusDate(
  yearMonth: string,
  focusDate: string | null,
): string | null {
  if (focusDate === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(focusDate) && focusDate.slice(0, 7) === yearMonth) {
    return focusDate;
  }
  return null;
}

export default function AttendanceEmployeeMonthScreen({ route, navigation }: Props) {
  // Back that works from anywhere (the AttendanceHome goBackSafely idiom).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const { employeeId, employeeName } = route.params;
  // The host owns the month; the pane's params are always echo-derived at
  // the call sites (the list's viewed month, the deep-link's workDate).
  const [yearMonth, setYearMonth] = useState(route.params.yearMonth);

  // The pair normalized ONCE on params (a mismatch is dev-warned and the
  // guard treats focusDate as absent).
  const rawFocusDate = route.params.focusDate ?? null;
  const focusDate = useMemo(
    () => normalizeFocusDate(route.params.yearMonth, rawFocusDate),
    [route.params.yearMonth, rawFocusDate],
  );
  const mismatched = rawFocusDate !== null && focusDate === null;
  useEffect(() => {
    if (mismatched) {
      console.warn(
        `[AttendanceEmployeeMonth] focusDate ${rawFocusDate} does not belong to yearMonth ${route.params.yearMonth} → treated as absent`,
      );
    }
    // Params are read once on mount (the route never re-fires them).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pane reports its rows/today/loading/refresh back (data ownership
  // stays in the pane; the parent holds the picked day only).
  const [report, setReport] = useState<RealMonthReport | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  // The focusDate auto-open's arming guard (D6): armed on mount (only
  // when a normalized focusDate arrived), spent after the first
  // successful landing; a manual pick stands it down.
  const armedRef = useRef(focusDate !== null);
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (!armedRef.current || report === null || report.today === null) return;
    armedRef.current = false;
    if (userPickedRef.current) return;
    if (focusDate !== null && report.days.has(focusDate)) {
      // Post-resolution only — the sheet's own announce fires exactly
      // once over real content.
      setPickedDay(focusDate);
    }
  }, [report, focusDate]);

  /** Loading-month taps are ignored: the pane's runFetch CLEARS the map
   *  on every month change — a tap into a cleared map must not mint a
   *  false "Not tracked" day sheet (U10). */
  const handlePickDay = useCallback(
    (workDate: string) => {
      if (report?.loading) return;
      userPickedRef.current = true;
      setPickedDay(workDate);
    },
    [report?.loading],
  );

  // The host's › bound from the pane's wire today — disabled-until-known,
  // disabled AT the current month (the day-statuses route does NOT 422 a
  // future range; a future month would be a silent all-not_tracked grid).
  const today = report?.today ?? null;
  const nextDisabled = today === null || yearMonth === today.slice(0, 7);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title={employeeName} onBack={goBackSafely} />

      <RealMonthPane
        employeeId={employeeId}
        yearMonth={yearMonth}
        onShiftMonth={delta => setYearMonth(current => shiftYearMonth(current, delta))}
        onPickDay={handlePickDay}
        onData={setReport}
        nextDisabled={nextDisabled}
      />

      {/* The icons' key, straight under the calendar (2026-10 copy review):
          the SAME component the My month screen renders — never restyled. */}
      <View style={styles.legendWrap}>
        <DayStatusLegend />
      </View>

      <DayDetailSheet
        visible={pickedDay !== null}
        workDate={pickedDay}
        day={
          pickedDay !== null && report
            ? report.days.get(pickedDay) ?? null
            : null
        }
        today={report?.today ?? null}
        scope={{ kind: 'owner', employeeId }}
        onClose={() => setPickedDay(null)}
        onCorrect={
          pickedDay !== null
            ? (body: CorrectionWriteBody) =>
                correctDay(employeeId, pickedDay, body)
            : undefined
        }
        onCorrected={report?.refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  // The legend Card keeps its own look — this wrapper only gives it the
  // screen gutter (the My month host's s4 padding, transplanted).
  legendWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
});
