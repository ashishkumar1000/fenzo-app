/**
 * useWeeklyOffDefaultForm — the tenant-default form state of
 * `WeeklyOffScreen` (Story 15-6, FR-18): the working day set, the effective
 * date, the dirty/save gating, the submit latch and the post-save re-seed.
 *
 * Extracted so `WeeklyOffScreen.tsx` stays within the ~300-line file limit
 * (15-6 review iteration 1 — the screen had outgrown the limit while three
 * extracted files' docblocks still claimed it was under it). The hook owns
 * state and rules; the screen owns layout, banners and navigation.
 *
 * Rules pinned by the 15-6 reviews and carried over verbatim:
 *  - The working copy seeds ONCE, on the false→true `hasLoaded` edge, from
 *    the canonical days (Sunday shown when never configured, visual only —
 *    `hasTouched` stays false so an untouched Save never PUTs `[7]`).
 *  - The effective date seeds ONLY from the scheduled future edit
 *    (`nextView.validFrom`, review P3) — never from the active default's
 *    own past start, and never from a payload the picker's floor would have
 *    blocked.
 *  - An EMPTY day set saves (the BE treats `days: []` as clearing the
 *    rule); the all-7-days selection blocks (FR-18's mirror).
 *  - Save latches in a ref (review iteration 1): `isSaving` is async state,
 *    so a second press in the window before re-render would fire two PUTs —
 *    the sheets already latched; the default block did not.
 *  - After a successful save the form re-seeds from the returned canonical
 *    (review P4): the BE stamps today on a blank effectiveFrom, so without
 *    the re-seed `hasTouched` stayed lit and an unchanged form re-PUT.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IsoWeekday,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
  WeeklyOffView,
} from '../../../services';
import {
  isWeeklyOffDirty,
  isWeeklyOffSaveDisabled,
  isValidIsoDate,
  SUNDAY,
  viewDays,
} from './weeklyOffModel';

export interface UseWeeklyOffDefaultFormOptions {
  defaultView: WeeklyOffDefaultResponse['default'];
  nextView: WeeklyOffDefaultResponse['next'];
  /** The full ascending range list — the strictly-future rows feed the panel. */
  history: WeeklyOffView[];
  hasLoaded: boolean;
  isSaving: boolean;
  today: string;
  saveDefault: (
    input: SetWeeklyOffRequest,
  ) => Promise<WeeklyOffDefaultResponse>;
  /** Transient success banner, flashed after a confirmed save. */
  onSaved: (message: string) => void;
}

export function useWeeklyOffDefaultForm({
  defaultView,
  nextView,
  history,
  hasLoaded,
  isSaving,
  today,
  saveDefault,
  onSaved,
}: UseWeeklyOffDefaultFormOptions) {
  const [selectedDays, setSelectedDays] = useState<IsoWeekday[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [hasTouched, setHasTouched] = useState(false);
  const submitLatchRef = useRef(false);

  const canonicalDays = useMemo<IsoWeekday[]>(
    () => viewDays(defaultView),
    [defaultView],
  );
  // "Never configured" is `canonical.length === 0` AFTER the first load
  // — before the load we can't know yet, so we default to false and let
  // the helper copy show the configured copy until the data arrives.
  const neverConfigured = hasLoaded && canonicalDays.length === 0;

  // Seed the working copy once when the data first arrives. Subsequent
  // re-fetches (e.g. after Save) MUST NOT clobber what the user has
  // working on — `hasLoadedRef` flips on the false→true edge so we only
  // seed on the initial load. Each remount (push/pop) re-runs this, so
  // we seed from the canonical here too: open the screen, see the saved
  // date and days reflected immediately.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoaded) return;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    if (canonicalDays.length > 0) {
      setSelectedDays(canonicalDays);
    } else {
      setSelectedDays([SUNDAY]);
    }
    // Initialise the effective date from the canonical when present.
    // Seed ONLY from the scheduled future edit (`nextView.validFrom`) —
    // never from the active default's own start (15-6 review P3), which
    // is typically in the past and would make the very first Save a
    // reschedule to that past date (silently clamped per AD-8). Empty
    // stays as "use today" for the save call — the BE treats absence as
    // today (AD-8).
    setEffectiveFrom(nextView?.validFrom ?? '');
    setHasTouched(false);
  }, [hasLoaded, canonicalDays, nextView]);

  const workingDays = useMemo(
    () => [...selectedDays].sort((a, b) => a - b),
    [selectedDays],
  );
  const canonicalSorted = useMemo(
    () => [...canonicalDays].sort((a, b) => a - b),
    [canonicalDays],
  );

  const sevenSelected = workingDays.length === 7;
  const noWorkingDays = workingDays.length === 0;
  // The field is a `DatePickerField` (Pressable + inline calendar) — it can
  // only emit a real `YYYY-MM-DD`, never hand-typed text (Spec Change Log 1
  // replaced the original text input). The calendar check still guards the
  // wire: "2026-02-31" matches the shape but is not a date (review P11).
  const dateValid =
    effectiveFrom === '' || isValidIsoDate(effectiveFrom);

  // Dirty iff the user touched something AND the working copy diverges
  // from the canonical — see `isWeeklyOffDirty`. `effectiveCanonicalFrom`
  // mirrors the seed's `nextView`-only rule, so a fresh mount after a
  // save-with-future-effectiveFrom doesn't spuriously light up Save.
  const effectiveCanonicalFrom = nextView?.validFrom ?? null;
  const effectiveDateChanged =
    effectiveCanonicalFrom !== null &&
    effectiveFrom !== effectiveCanonicalFrom;
  const dirty = isWeeklyOffDirty({
    hasTouched,
    effectiveDateChanged,
    workingDays,
    canonicalDays: canonicalSorted,
  });

  const saveDisabled = isWeeklyOffSaveDisabled({
    dirty,
    workingDays,
    dateValid,
    isSaving,
  });

  // Future rows for the "Upcoming changes" panel. `history` is the full
  // ascending effective-dated list; anything strictly after today is future
  // (past rows never appear in the panel — the list screen owns history).
  const upcoming = useMemo(
    () => (hasLoaded ? history.filter((h) => h.validFrom > today) : []),
    [hasLoaded, history, today],
  );

  const onDayToggle = useCallback((next: IsoWeekday[]) => {
    setHasTouched(true);
    setSelectedDays(next);
  }, []);

  const onEffectiveFromChange = useCallback((v: string) => {
    setHasTouched(true);
    setEffectiveFrom(v);
  }, []);

  const onSave = useCallback(async () => {
    if (saveDisabled || submitLatchRef.current) return;
    submitLatchRef.current = true;
    try {
      // saveDefault returns the re-fetched GET (canonical), falling back
      // to the PUT echo only if that re-fetch failed.
      const fresh = await saveDefault({
        days: workingDays,
        effectiveFrom: effectiveFrom || undefined,
      });
      onSaved('Weekly off saved');
      // Re-seed the working copy from the canonical response (15-6
      // review P4): the BE stamps today on a blank effectiveFrom, so
      // without this `hasTouched` stayed lit, the form read dirty and a
      // second tap re-PUT the same change. Resetting `hasTouched` alone
      // is not enough when the server merged/normalised the range —
      // re-seed so the form shows the server's truth.
      setHasTouched(false);
      const freshDays = viewDays(fresh.default);
      setSelectedDays(freshDays.length > 0 ? freshDays : [SUNDAY]);
      setEffectiveFrom(fresh.next?.validFrom ?? '');
    } catch {
      // saveError is surfaced in the banner area; form stays populated so
      // the user can retry without re-entering.
    } finally {
      submitLatchRef.current = false;
    }
  }, [saveDisabled, saveDefault, workingDays, effectiveFrom, onSaved]);

  return {
    neverConfigured,
    selectedDays,
    effectiveFrom,
    sevenSelected,
    noWorkingDays,
    saveDisabled,
    upcoming,
    onDayToggle,
    onEffectiveFromChange,
    onSave,
  };
}
