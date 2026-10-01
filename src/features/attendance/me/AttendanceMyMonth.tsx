/**
 * AttendanceMyMonth — the technician's OWN month section (Story 19-6 D5),
 * embedded in BOTH the active and history_only tab postures (the section
 * itself is access-state-agnostic: the parent owns the access state and
 * passes `historyOnly` + the wire's `attendanceEndedOn`).
 *
 * Anatomy: SectionHead "My month", then (gap s3 — the Summary wrap's
 * rhythm) the me-scoped RealMonthPane at FULL height verbatim → the
 * summary block → the holidays block. Internal order is the UX ruling:
 * calendar → so-far line → chips → meta → holidays. While the summary is
 * in flight the block carries its OWN small shimmer (the pane's shimmer
 * covers the grid, never these rows); the grouped a11y element waits for
 * the numbers.
 *
 * The section owns yearMonth (the 19-5 bootstrap idiom, faithful): the
 * seed is the DEVICE month as declared navigation scaffolding (which
 * month to LOOK at — never a fetch boundary); when the canonical echo
 * first lands (the pane's RealMonthReport.today — this section's ONE
 * clock), the displayed month corrects ONCE toward the target — today's
 * month when active, min(today, ended) when history_only (an employee
 * ended in August opens on their last real month) — and the correction
 * follow-up is a PARAMETER load (the month label changes under the
 * pane's own clearing fetch), re-armed on its failure so the one shot is
 * never burned by a flaky network. "Navigated" means ‹/› presses ONLY —
 * a day-sheet tap never stands the correction down. The section's
 * failure oracle for the re-arm is the summary hook's error; the pane's
 * own failure keeps its Retry local (the report shape is unchanged).
 *
 * Fetch windows are always the hook's echo-clamped monthlyWindow — no
 * plain-range fetch exists here. › stops forward travel only and never
 * snaps the month back: the current month when active, the ended month
 * when history_only (canonical today falls back when the date is null).
 * Loading-month day picks are ignored (a cleared map must not mint false
 * "Not tracked" sheets). The day sheet is READ-ONLY (no write plumbing —
 * CorrectionHistory stays me-scoped verbatim). The summary block's error
 * posture is DATA-AWARE: no summary → the hard copy + the labelled Retry
 * (two stacked "Retry" buttons must be tellable apart — triage #9); a
 * failed SILENT refresh over live chips → the stale-note InlineError
 * (the AttendanceSummaryView vocabulary — the numbers stand, the next
 * focus/AppState refresh revalidates; a Retry here would clear-and-refetch
 * the whole block for no new information).
 *
 * `todaySignal` is the check-in BRIDGE (review 2026-09-30): the check-in
 * card above mutates today's record (and the summary refetches), but the
 * pane's day map has no focus refetch — without a bridge, tapping today's
 * cell seconds after "Checked in 9:05" reads "Not tracked". The parent
 * derives the signal from the loaded today facts; a genuine CHANGE (never
 * the first observation) fires the pane's non-clearing refresh — one GET,
 * no spinner, the glyphs swap in place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, InlineError, SectionHead, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { DayDetailSheet } from '../calendar/DayDetailSheet';
import { RealMonthPane } from '../calendar/RealMonthPane';
import type { RealMonthReport } from '../calendar/RealMonthPane';
import {
  formatHolidayShortDate,
  shiftYearMonth,
} from '../monthly/monthlyModel';
import { useMyMonthly } from './useMyMonthly';
import { MyMonthSummary } from './MyMonthSummary';

/** The device month 'YYYY-MM' — the declared navigation SEED only (the
 *  device clock is never a fetch boundary; the echo corrects it). */
function deviceYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The bootstrap correction's target (D5): today's month when active,
 *  min(today, ended) when history_only — a null ended date falls back to
 *  today's month (the today-open is unavoidable and accepted). */
function correctionTarget(
  canonicalToday: string,
  historyOnly: boolean,
  attendanceEndedOn: string | null,
): string {
  const todayMonth = canonicalToday.slice(0, 7);
  if (!historyOnly) return todayMonth;
  const endedMonth = attendanceEndedOn?.slice(0, 7) ?? todayMonth;
  return endedMonth < todayMonth ? endedMonth : todayMonth;
}

export function AttendanceMyMonth({
  attendanceEndedOn,
  historyOnly,
  todaySignal,
}: {
  /** The wire's history_only-only end date (null = the dateless fallback
   *  lives in the parent's note; here it only bounds the bootstrap). */
  attendanceEndedOn: string | null;
  /** The parent's posture — the section rides the SAME branch mount, so a
   *  flip remounts and re-runs the bootstrap. */
  historyOnly: boolean;
  /** The parent's today-facts fingerprint (date + check-in/out instants).
   *  A genuine change fires the pane's non-clearing refresh — the check-in
   *  bridge. Null (summary unloaded — history_only) is inert. */
  todaySignal?: string | null;
}) {
  const [yearMonth, setYearMonth] = useState(deviceYearMonth);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [report, setReport] = useState<RealMonthReport | null>(null);
  const canonicalToday = report?.today ?? null;

  // The echo-correction state machine: navigated (‹/› only) stands down;
  // corrected is the ONE shot; correctionMonth tracks its follow-up so a
  // failure re-arms instead of burning it.
  const yearMonthRef = useRef(yearMonth);
  yearMonthRef.current = yearMonth;
  const navigatedRef = useRef(false);
  const correctedRef = useRef(false);
  const correctionMonthRef = useRef<string | null>(null);

  const myMonth = useMyMonthly({ yearMonth, today: canonicalToday });

  // R9 (device-found 2026-10-01, walkthrough): the wire date arrives on a
  // LATER me/access than the pane's echo — the profile seed carries the
  // history_only posture but a NULL date (the /users/me mirror is the tab
  // GATE vocabulary, deliberately without the date). A one-shot correction
  // that fired on the echo alone burned on the wrong target: the employee
  // landed on today's empty month instead of their last real one. While
  // the employee has not navigated, an attendanceEndedOn TRANSITION re-opens
  // the shot (and re-runs the main correction effect via its dep below);
  // once navigated, the user's choice stands.
  const prevEndedRef = useRef(attendanceEndedOn);
  useEffect(() => {
    if (navigatedRef.current) return;
    if (prevEndedRef.current !== attendanceEndedOn) {
      prevEndedRef.current = attendanceEndedOn;
      correctedRef.current = false;
      correctionMonthRef.current = null;
    }
  }, [attendanceEndedOn]);

  // The ONE echo-correction: fires on the first echo landing, applies the
  // target ONCE as a parameter load (setYearMonth — the pane refetches
  // with its own clearing fetch under the changed label), and re-arms on
  // the follow-up's failure (the hook's error is the section's failure
  // oracle). Re-runs on every report/hook settle; the guards make the
  // extra passes no-ops.
  useEffect(() => {
    if (canonicalToday === null || navigatedRef.current) return;
    if (correctionMonthRef.current !== null) {
      if (myMonth.loading) return; // the follow-up is still in flight
      correctionMonthRef.current = null;
      if (myMonth.error !== null) correctedRef.current = false;
      return;
    }
    if (correctedRef.current) return;
    correctedRef.current = true;
    const target = correctionTarget(canonicalToday, historyOnly, attendanceEndedOn);
    if (target !== yearMonthRef.current) {
      correctionMonthRef.current = target;
      setYearMonth(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, myMonth.loading, myMonth.error, attendanceEndedOn]);

  // A settled correction clears its tracker (a failed one re-arms above).
  useEffect(() => {
    if (
      correctionMonthRef.current !== null &&
      !myMonth.loading &&
      myMonth.error === null &&
      myMonth.data !== null
    ) {
      correctionMonthRef.current = null;
    }
  }, [myMonth.loading, myMonth.error, myMonth.data]);

  // ‹/› ONLY (never a day-sheet tap) — and the bound is computed per
  // posture: the current month when active; the ended month when
  // history_only (stops forward travel, never snaps back).
  const onShiftMonth = useCallback((delta: number) => {
    navigatedRef.current = true;
    setYearMonth(shiftYearMonth(yearMonthRef.current, delta));
  }, []);

  const nextDisabled =
    canonicalToday === null ||
    yearMonth >=
      (historyOnly
        ? (attendanceEndedOn ?? canonicalToday).slice(0, 7)
        : canonicalToday.slice(0, 7));

  const onPickDay = useCallback(
    (workDate: string) => {
      if (report?.loading) return; // loading-month picks are ignored
      setPickedDay(workDate);
    },
    [report?.loading],
  );

  const onData = useCallback((next: RealMonthReport) => setReport(next), []);

  // The check-in bridge: the FIRST observation arms (a summary landing
  // must not spend an extra day-statuses GET); a subsequent DIFFERENT
  // fingerprint means today's record mutated under a mounted pane — fire
  // its non-clearing refresh (report can be null before the pane's first
  // onData; the handle is read through a ref so the effect stays keyed on
  // the signal alone).
  const lastSignalRef = useRef<string | null>(null);
  const paneRefreshRef = useRef<(() => void) | null>(null);
  paneRefreshRef.current = report?.refresh ?? null;
  useEffect(() => {
    const prev = lastSignalRef.current;
    lastSignalRef.current = todaySignal ?? null;
    if (todaySignal != null && prev != null && prev !== todaySignal) {
      paneRefreshRef.current?.();
    }
  }, [todaySignal]);

  const isCurrentMonth =
    canonicalToday !== null && yearMonth === canonicalToday.slice(0, 7);
  const summary = myMonth.data?.summary ?? null;
  const holidays = myMonth.data?.upcomingHolidays ?? [];

  return (
    <View style={styles.section}>
      <SectionHead title="My month" />
      <View style={styles.body}>
        <RealMonthPane
          yearMonth={yearMonth}
          onShiftMonth={onShiftMonth}
          onPickDay={onPickDay}
          onData={onData}
          nextDisabled={nextDisabled}
        />

        {myMonth.error !== null && summary === null ? (
          <View style={styles.errorWrap}>
            <InlineError message={myMonth.error} />
            {/* A secondary Retry, DISTINCTLY labelled — two stacked
                "Retry" buttons (the pane's + this) must be tellable
                apart; the shared Button does not forward
                accessibilityLabel, so this is the sheet-row Pressable
                idiom at the sm button's metrics. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry month summary"
              onPress={myMonth.retry}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && styles.retryBtnPressed,
              ]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {myMonth.error !== null && summary !== null ? (
          // A failed SILENT refresh over live chips — the numbers are on
          // screen; the hard first-load copy would lie about them.
          <InlineError message="Couldn't refresh just now — these numbers may be out of date." />
        ) : null}

        {summary !== null ? (
          <MyMonthSummary summary={summary} isCurrentMonth={isCurrentMonth} />
        ) : myMonth.loading ? (
          // First paint: the summary block's OWN small shimmer (the pane's
          // shimmer covers the grid, never these rows). A failed refresh
          // keeps the error postures above; loading renders no numbers.
          <View accessibilityLabel="Loading attendance">
            <Skeleton rows={2} height={40} />
          </View>
        ) : null}

        {!historyOnly && holidays.length > 0 ? (
          <View style={styles.holidays}>
            <Eyebrow>Upcoming holidays</Eyebrow>
            {holidays.map(holiday => (
              <Text
                key={holiday.holidayDate}
                accessibilityLabel={`${holiday.holidayName}, ${formatHolidayShortDate(holiday.holidayDate)}`}
                style={styles.holidayRow}>
                {`${holiday.holidayName} · ${formatHolidayShortDate(holiday.holidayDate)}`}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <DayDetailSheet
        visible={pickedDay !== null}
        workDate={pickedDay}
        day={pickedDay !== null ? (report?.days.get(pickedDay) ?? null) : null}
        scope={{ kind: 'me' }}
        today={canonicalToday}
        readOnly
        onClose={() => setPickedDay(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s2,
  },
  body: {
    gap: spacing.s3,
  },
  errorWrap: {
    gap: spacing.s2,
  },
  holidays: {
    gap: spacing.s2,
  },
  holidayRow: {
    ...typography.body,
    color: colors.textBody,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  retryBtnPressed: {
    opacity: 0.85,
  },
  retryText: {
    ...typography.bodySm,
    color: colors.textStrong,
  },
});
