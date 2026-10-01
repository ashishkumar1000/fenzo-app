/**
 * useDashboardData — the owner dashboard's load/refetch hook (Story 19-4;
 * split verbatim from AttendanceDashboardScreen under the ≤300-line rule).
 * The screen renders, this fetches: the ONE-fetch-per-appearance discipline
 * the focus effect and the AppState effect both call into (`load`), the
 * picked-office refs (the ref drives the fetch; a ref change never re-fires
 * the focus effect), and the last-good failure seams.
 *
 * Postures owned here (spec D9/D10):
 *   - First load → `firstLoadError` replaces the content region (nothing
 *     stale to keep).
 *   - User-initiated fetches AFTER first load (the Refresh press and an
 *     office pick) hold the card shimmer until they settle — a pick
 *     changes scope, so the previous office's numbers never sit under
 *     the picked office's name while loading (user direction
 *     2026-10-02). Focus/AppState refetches stay silent in-place
 *     updates (same scope — the D10 discipline).
 *   - Refetch failure keeps the last-good data and surfaces `refetchError`
 *     BELOW the content.
 *   - A pick whose refetch FAILS reverts the selector to where the
 *     on-screen numbers actually came from (never a picked office over the
 *     previous office's numbers).
 *   - Sites-pill count: the envelope's `offices` registry (one source) —
 *     the parallel `officesService.list()` fallback runs only while the
 *     envelope carries none; its failure just hides the pill.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDashboard, officesService } from '../../../services';
import type { AttendanceDashboardData } from '../../../services';
import { LOAD_ERROR_COPY } from './LoadErrorRetry';

/** The pick payload the filter sheet commits — null = "All offices". */
export type DashboardOfficePick = { id: string; name: string } | null;

export function useDashboardData() {
  const [data, setData] = useState<AttendanceDashboardData | null>(null);
  /** The last-good envelope — the load/refetch seam lives on data alone.
   *  Assigned in an EFFECT, never in the render body (a render-time ref
   *  write tears under concurrent mode; every read happens post-commit —
   *  the focus/AppState effects fire after the commit's effect flush). */
  const dataRef = useRef<AttendanceDashboardData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  /** The FIRST fetch settled (success OR failure) — flips postures once. */
  const [hasSettled, setHasSettled] = useState(false);
  /** The first load's failure (nothing stale to keep). */
  const [firstLoadError, setFirstLoadError] = useState<string | null>(null);
  /** A REFETCH failure with last-good data on screen. */
  const [refetchError, setRefetchError] = useState(false);
  /** A fetch is in flight AFTER first load (device feedback gap found in
   *  the walkthrough: pressing Refresh with unchanged numbers looked like
   *  nothing happened — the button must show the pull). */
  const [refetching, setRefetching] = useState(false);
  /** The Refresh BUTTON's pull ALSO re-shows the card shimmer (user
   *  direction: "when refresh is clicked shimmer should come again") —
   *  only for the manual press; focus/AppState refetches stay silent
   *  in-place updates (the D10 discipline). */
  const [manualShimmer, setManualShimmer] = useState(false);
  /** How many in-flight fetches hold the shimmer up — two shimmering
   *  callers never end each other's pull early (the first finally must
   *  not drop the shimmer while the later fetch is still running). */
  const shimmerRefs = useRef(0);

  // The picked office: the ref drives the fetch (a ref change never
  // re-fires the focus effect), the state drives the filter field.
  const [pickedOffice, setPickedOffice] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const officeIdRef = useRef<string | null>(null);
  /** The CURRENT pick's name — set synchronously by onPick (the ref mirror
   *  the failing catch reads; an effect mirror would lag one commit). */
  const pickedNameRef = useRef<string | null>(null);
  /** The LAST SUCCESSFUL envelope's office — what the on-screen numbers
   *  were actually fetched under. A pick's refetch failing must put the
   *  selector back HERE, or the field would show the picked office over
   *  the previous office's numbers. */
  const lastGoodPickRef = useRef<{ id: string; name: string } | null>(null);
  const seqRef = useRef(0);
  const /** The office count for the Sites pill — null while never known
         *  (the pill hides rather than shows a made-up number); a failed
         *  fallback keeps the last count it had from an envelope. */
    [officeCount, setOfficeCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    // The fetch's office — the pick THIS envelope answers; the last-good
    // seam below reverts to what the numbers actually show on failure.
    const fetchOfficeId = officeIdRef.current;
    const fetchOfficeName = pickedNameRef.current;
    // The refetch indicator: EVERY load dims/disables the Refresh button —
    // pressed with unchanged numbers must still visibly work.
    setRefetching(true);
    // The Sites pill's count: the envelope's own `offices` registry when
    // the deployed BE includes it (one source, the tiles' fetch); the
    // parallel `officesService.list()` fallback runs only while the
    // envelope has none (first look / older BE) — its failure never
    // touches the tiles, it just hides the pill.
    if (dataRef.current === null || dataRef.current.offices === null) {
      void officesService
        .list()
        .then(list => {
          if (seq !== seqRef.current) return;
          setOfficeCount(prev => prev ?? list.length);
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          // Leave any known count; an unknown one stays unknown (null hides
          // the pill — never a stale or made-up number).
        });
    }
    try {
      const res = await fetchDashboard(officeIdRef.current ?? undefined);
      if (seq !== seqRef.current) return;
      if (res.offices !== null) setOfficeCount(res.offices.length);
      lastGoodPickRef.current =
        fetchOfficeId === null
          ? null
          : { id: fetchOfficeId, name: fetchOfficeName ?? '' };
      setData(res);
      setFirstLoadError(null);
      setRefetchError(false);
      setRefetching(false);
      setHasSettled(true);
    } catch {
      if (seq !== seqRef.current) return;
      setRefetching(false);
      setHasSettled(true);
      // An office pick whose refetch FAILED reverts to the last good pick —
      // the failed fetch changed nothing, so the selector must point where
      // the on-screen numbers actually came from (never a picked office
      // over the previous office's numbers).
      const lastGood = lastGoodPickRef.current;
      if ((lastGood?.id ?? null) !== officeIdRef.current) {
        officeIdRef.current = lastGood?.id ?? null;
        pickedNameRef.current = lastGood?.name ?? null;
        setPickedOffice(
          lastGood ? { id: lastGood.id, name: lastGood.name } : null,
        );
      }
      if (dataRef.current === null) {
        setFirstLoadError(LOAD_ERROR_COPY);
      } else {
        setRefetchError(true);
      }
    }
  }, []);

  /** The manual-shimmer pull — user-initiated fetches (the Refresh press
   *  AND an office pick): the card shimmer holds until the fetch settles,
   *  refcounted so overlapping pulls never drop it early. Focus/AppState
   *  refetches never shimmer (same-scope silent in-place updates — a
   *  PICK changes scope, so the previous office's numbers may not sit
   *  under the new office's name). */
  const runWithShimmer = useCallback(
    (op: () => Promise<void>) => {
      shimmerRefs.current += 1;
      setManualShimmer(true);
      void op().finally(() => {
        shimmerRefs.current -= 1;
        if (shimmerRefs.current === 0) setManualShimmer(false);
      });
    },
    [],
  );

  /** The manual Refresh press ALSO re-shows the card shimmer — only
   *  manual; focus/AppState refetches stay silent (the D10 discipline). */
  const refresh = useCallback(() => {
    runWithShimmer(load);
  }, [load, runWithShimmer]);

  /** The pick commit from the filter sheet: the refs first (the SAME tick
   *  `load` reads them), then the field, then the reload. The sheet close
   *  itself is the CALLER's (the screen owns sheet visibility). A pick
   *  CHANGES SCOPE — the previous office's numbers must never sit under
   *  the picked office's name while the fetch runs, so the pick holds the
   *  card shimmer like a Refresh press (user direction 2026-10-02). */
  const onPickOffice = useCallback(
    (office: DashboardOfficePick) => {
      officeIdRef.current = office !== null ? office.id : null;
      pickedNameRef.current = office !== null ? office.name : null;
      setPickedOffice(office);
      runWithShimmer(load);
    },
    [load, runWithShimmer],
  );

  return {
    data,
    hasSettled,
    firstLoadError,
    refetchError,
    refetching,
    manualShimmer,
    pickedOffice,
    officeCount,
    load,
    refresh,
    onPickOffice,
  } as const;
}