/**
 * useMonthlyData — the owner monthly list's load engine (Story 19-5 D4;
 * split from AttendanceMonthlyScreen under the ≤300-line rule, the
 * useDashboardData shape). The screen renders, this fetches.
 *
 *  - SEQ-GUARDED LATEST-WINS (the useMonthStatuses seq shape): only the
 *    LATEST request may commit rows or touch state — an older-resolves-late
 *    response (fast ‹ › interleaving) never commits and never reverts.
 *  - Month and office live in REFS mirrored at COMMIT (the officeIdRef
 *    idiom, BOTH axes): every load — first focus, focus refetch,
 *    AppState-active, parameter change — reads the refs, so a focus
 *    refetch after returning from the drill-down reloads the VIEWED
 *    month/office, never the defaults.
 *  - On failure the revert restores the last-good PAIR {yearMonth,
 *    officeId} — the pair the on-screen rows actually came from — never
 *    one axis (a single-axis revert would pair "August" with All-offices
 *    rows).
 *  - PARAMETER loads (month switch, office pick, the echo-correction's
 *    follow-up) surface `paramLoading`: the screen answers them with the
 *    row Skeleton — the user's 2026-09-30 direction ("can we add some
 *    loader while the data is fetching"), superseding Q5's silent swap.
 *    The flag stands until the LATEST request settles (a silent refetch
 *    superseding a param load keeps the skeleton up — the old rows must
 *    never show under the new label); a refetch starting on an idle
 *    screen stays silent in-place.
 *  - The default-month bootstrap closes the echo circle (D4): the initial
 *    yearMonth is the device-seeded LAST month (declared navigation
 *    scaffolding — the device clock picks which month to LOOK at first,
 *    never a fetch boundary); when the first echo lands, the canonical
 *    default shiftYearMonth(today, -1) is computed ONCE and corrects the
 *    month only if it differs AND the owner has not navigated.
 *  - Fetch windows are derived in the model: monthlyWindow clamps against
 *    the last-known WIRE today; before the first echo the seeded past
 *    month needs no clamp (the current month is only ever reached by an
 *    explicit ›, gated on today being known).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonthly } from '../../../services';
import type { AttendanceMonthlyData } from '../../../services';
import { monthRange } from '../../../services/resources/attendanceDayStatus';
import { monthlyWindow, shiftYearMonth } from './monthlyModel';

/** The fixed error copy (spec copy table) — never err.message (the
 *  normalizer's throw strings are developer-shaped). */
export const MONTHLY_ERROR_COPY =
  "Couldn't load the monthly view. Check your connection and try again.";

/** The office pick payload the filter sheet commits — null = All offices. */
export type MonthlyOfficePick = { id: string; name: string } | null;

/** The device-seeded bootstrap month: LAST month (UJ-4 — the owner opens
 *  for last month), so the first fetch needs no clamp. Scaffolding only. */
function initialYearMonth(): string {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return shiftYearMonth(thisMonth, -1);
}

/** The fetch window for a load: echo-derived when the wire today is known
 *  (the clamp); before the first echo the seeded past month takes its
 *  plain range (never a device-derived clamp — the device clock never
 *  draws a fetch boundary). */
function windowFor(
  yearMonth: string,
  today: string | null,
): { from: string; to: string } {
  return today === null ? monthRange(yearMonth) : monthlyWindow(yearMonth, today);
}

/** The last-good pair — what the on-screen rows actually came from. */
interface LastGoodPair {
  yearMonth: string;
  officeId: string | null;
  officeName: string | null;
}

export function useMonthlyData() {
  const [data, setData] = useState<AttendanceMonthlyData | null>(null);
  /** The last-good envelope — the load/refetch seam lives on data alone.
   *  Assigned in an EFFECT, never in the render body (a render-time ref
   *  write tears under concurrent mode; every read happens post-commit). */
  const dataRef = useRef<AttendanceMonthlyData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** The FIRST fetch settled (success OR failure) — flips postures once. */
  const [hasSettled, setHasSettled] = useState(false);
  /** The first load's failure (nothing stale to keep). */
  const [firstLoadError, setFirstLoadError] = useState<string | null>(null);
  /** A REFETCH failure with last-good data on screen. */
  const [refetchError, setRefetchError] = useState(false);

  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [pickedOffice, setPickedOffice] = useState<MonthlyOfficePick>(null);

  // BOTH parameter axes live in refs mirrored at COMMIT; every load reads
  // the refs, so a focus refetch reloads the VIEWED month/office.
  const yearMonthRef = useRef(yearMonth);
  useEffect(() => {
    yearMonthRef.current = yearMonth;
  }, [yearMonth]);
  const officeIdRef = useRef<string | null>(null);
  const officeNameRef = useRef<string | null>(null);
  useEffect(() => {
    officeIdRef.current = pickedOffice?.id ?? null;
    officeNameRef.current = pickedOffice?.name ?? null;
  }, [pickedOffice]);

  /** The last-good PAIR — the revert target on a failed load. */
  const lastGoodPairRef = useRef<LastGoodPair>({
    yearMonth: initialYearMonth(),
    officeId: null,
    officeName: null,
  });
  const seqRef = useRef(0);
  /** The owner has navigated months manually — the echo-correction stands
   *  down (their choice wins, D4). */
  const navigatedRef = useRef(false);
  /** The echo-correction fires AT MOST once per mount — re-armed if its
   *  own follow-up fetch FAILS, so the one shot is not burned by a flaky
   *  network (the next successful fetch re-attempts it). */
  const correctedRef = useRef(false);
  /** The month the correction's follow-up fetch is fetching, if any —
   *  the settle paths read it to clear / re-arm `correctedRef`. */
  const correctionMonthRef = useRef<string | null>(null);
  /** A PARAMETER load (month switch / office pick) is the latest request
   *  in flight — the screen answers it with the row Skeleton (the user's
   *  2026-09-30 direction, superseding Q5's silent swap). Focus/AppState
   *  refetches stay silent in-place and never set this. */
  const [paramLoading, setParamLoading] = useState(false);
  const paramSeqRef = useRef<number | null>(null);

  /** Apply a month without fetching (the revert + correction path write
   *  the ref FIRST — the same tick a following load reads it). */
  const applyYearMonth = useCallback((next: string) => {
    yearMonthRef.current = next;
    setYearMonth(next);
  }, []);

  /** Apply an office pick without fetching. */
  const applyOffice = useCallback((office: MonthlyOfficePick) => {
    officeIdRef.current = office?.id ?? null;
    officeNameRef.current = office?.name ?? null;
    setPickedOffice(office);
  }, []);

  /** Ref to the latest runLoad — the echo-correction's follow-up fetch
   *  goes through it (a useCallback cannot close over itself; the ref is
   *  assigned in an effect, and reads happen post-commit only). */
  const runLoadRef = useRef<(isParam: boolean) => Promise<void>>(
    async () => {},
  );

  /** The load body; `isParam` marks a month/office switch (its skeleton
   *  posture vs the silent refetches). */
  const runLoad = useCallback(
    async (isParam: boolean) => {
      const seq = ++seqRef.current;
      if (isParam) {
        paramSeqRef.current = seq;
        setParamLoading(true);
      }
      try {
        const fetchYearMonth = yearMonthRef.current;
        const fetchOfficeId = officeIdRef.current;
        const { from, to } = windowFor(
          fetchYearMonth,
          dataRef.current?.today ?? null,
        );
        const res = await fetchMonthly(from, to, fetchOfficeId ?? undefined);
        if (seq !== seqRef.current) return;
        // The skeleton stands until the LATEST request settles — a
        // superseded param load leaves the flag to its successor (the
        // successor's commit owns the screen; an early stand-down would
        // pair the new label with the previous month's rows).
        if (seq === seqRef.current && paramSeqRef.current !== null) {
          paramSeqRef.current = null;
          setParamLoading(false);
        }
        lastGoodPairRef.current = {
          yearMonth: fetchYearMonth,
          officeId: fetchOfficeId,
          officeName: officeNameRef.current,
        };
        setData(res);
        setFirstLoadError(null);
        setRefetchError(false);
        setHasSettled(true);
        // The ONE echo-correction (D4): the canonical default is the wire
        // echo's last month — correct only when it differs AND the owner
        // has not navigated. Their choice stands otherwise. The follow-up
        // is a PARAMETER load (the month label changes under it — it gets
        // the skeleton, never a silent swap), tracked so its failure
        // re-arms the correction instead of burning the one shot.
        if (!correctedRef.current && !navigatedRef.current) {
          correctedRef.current = true;
          const canonical = shiftYearMonth(res.today.slice(0, 7), -1);
          if (canonical !== fetchYearMonth) {
            applyYearMonth(canonical);
            correctionMonthRef.current = canonical;
            void runLoadRef.current(true);
          }
        }
        if (correctionMonthRef.current === fetchYearMonth) {
          correctionMonthRef.current = null;
        }
      } catch {
        if (seq !== seqRef.current) return;
        if (seq === seqRef.current && paramSeqRef.current !== null) {
          paramSeqRef.current = null;
          setParamLoading(false);
        }
        setHasSettled(true);
        // A failed correction follow-up re-arms the correction — the
        // owner's next successful fetch retries it once (a flaky network
        // must not strand the seeded wrong month for the session).
        if (correctionMonthRef.current !== null) {
          correctionMonthRef.current = null;
          correctedRef.current = false;
        }
        // The PAIR revert: restore both axes to where the on-screen rows
        // came from — never one axis (a single-axis revert would pair the
        // picked month with the previous office's rows).
        const lastGood = lastGoodPairRef.current;
        if (
          lastGood.yearMonth !== yearMonthRef.current ||
          (lastGood.officeId ?? null) !== officeIdRef.current
        ) {
          applyYearMonth(lastGood.yearMonth);
          applyOffice(
            lastGood.officeId === null
              ? null
              : { id: lastGood.officeId, name: lastGood.officeName ?? '' },
          );
        }
        if (dataRef.current === null) {
          setFirstLoadError(MONTHLY_ERROR_COPY);
        } else {
          setRefetchError(true);
        }
      }
    },
    [applyOffice, applyYearMonth],
  );

  useEffect(() => {
    runLoadRef.current = runLoad;
  }, [runLoad]);

  /** The focus/AppState entry point — always a SILENT load. */
  const load = useCallback(() => runLoad(false), [runLoad]);

  /** The owner's month navigation: the ref first (the SAME tick `load`
   *  reads it), the standing-down of the echo-correction, then the load —
   *  a PARAMETER load (the skeleton posture). */
  const shiftMonth = useCallback(
    (delta: number) => {
      applyYearMonth(shiftYearMonth(yearMonthRef.current, delta));
      navigatedRef.current = true;
      void runLoad(true);
    },
    [applyYearMonth, runLoad],
  );

  /** The pick commit from the filter sheet; the sheet close is the
   *  CALLER's (the screen owns sheet visibility) — a PARAMETER load. */
  const onPickOffice = useCallback(
    (office: MonthlyOfficePick) => {
      applyOffice(office);
      void runLoad(true);
    },
    [applyOffice, runLoad],
  );

  return {
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
  } as const;
}
