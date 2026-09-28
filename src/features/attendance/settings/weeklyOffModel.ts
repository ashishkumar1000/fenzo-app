/**
 * weeklyOffModel — pure helpers for the Weekly off surfaces (Story 15-6).
 *
 * Split out of `WeeklyOffScreen.tsx` so the screen stays under the ~300-line
 * file limit (the same reason 15-4 moved payload building into
 * `officeFormModel`). Nothing here touches React: the ISO-weekday
 * vocabulary, the date formatter and the day-set copy only.
 */
import type { IsoWeekday, WeeklyOffView } from '../../../services';

// Story 15-6 review (P15): the per-feature long-date copy (device-locale
// `toLocaleDateString`) is replaced by the one pinned `en-IN` formatter in
// utils — re-exported here so the existing `./weeklyOffModel` import sites
// keep working.
export { formatLongDate } from '../../../utils';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** FR-18's default day, shown preselected on first open (visual only). */
export const SUNDAY: IsoWeekday = 7;

/** The days of a weekly-off view — empty when the view is null. */
export function viewDays(view: WeeklyOffView | null): IsoWeekday[] {
  return view?.days ?? [];
}

/**
 * A real calendar date, not just the ISO shape: the components must
 * round-trip — "2026-02-31" and "2027-02-29" are invalid even though they
 * match the regex. Story 15-6 review (P11): the screens previously trusted
 * the regex alone.
 */
export function isValidIsoDate(yyyyMmDd: string): boolean {
  if (!ISO_DATE.test(yyyyMmDd)) return false;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

/**
 * Pretty subtitle for a day set — "Fri only", "Sat + Sun", "Mon, Wed + Fri".
 * (15-6 review iteration 1: the docstring used to say "Friday only" while
 * the code emits the short label.) Sorts a deduped copy and drops
 * out-of-range values itself (Story 15-6 review P11): callers pass view
 * days verbatim, so this helper must not depend on them arriving sorted
 * and in range.
 */
export function describeDays(days: IsoWeekday[]): string {
  const sorted = [...new Set(days)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 'All days working';
  if (sorted.length === 1) return `${DAY_LABELS[sorted[0] - 1]} only`;
  if (sorted.length === 2) {
    return `${DAY_LABELS[sorted[0] - 1]} + ${DAY_LABELS[sorted[1] - 1]}`;
  }
  return sorted
    .map((d) => DAY_LABELS[d - 1])
    .join(', ')
    .replace(/, ([^,]*)$/, ' + $1');
}

/**
 * Is the tenant-default form dirty?
 *
 * Dirty iff the user touched the form AND the working copy diverges from
 * the canonical: the day set differs, or the effective date moved off the
 * date they are editing toward. Sunday-preselect on a never-configured
 * tenant keeps `hasTouched` false, so an untouched Save never PUTs `[7]`
 * (FR-18's mirror).
 *
 * `canonicalDays` must already be sorted ascending, as is `workingDays`.
 */
export function isWeeklyOffDirty({
  hasTouched,
  effectiveDateChanged,
  workingDays,
  canonicalDays,
}: {
  hasTouched: boolean;
  effectiveDateChanged: boolean;
  workingDays: IsoWeekday[];
  canonicalDays: IsoWeekday[];
}): boolean {
  if (!hasTouched) return false;
  return (
    effectiveDateChanged ||
    workingDays.length !== canonicalDays.length ||
    workingDays.some((d, i) => d !== canonicalDays[i])
  );
}

/**
 * Save is blocked when the form isn't dirty, would make every day a day
 * off (FR-18's mirror), has an unparseable date, or is already in flight.
 * An EMPTY day set is a valid save — the BE contract treats `days: []`
 * as clearing the rule, so it must not block here (Story 15-6 review P2).
 */
export function isWeeklyOffSaveDisabled({
  dirty,
  workingDays,
  dateValid,
  isSaving,
}: {
  dirty: boolean;
  workingDays: IsoWeekday[];
  dateValid: boolean;
  isSaving: boolean;
}): boolean {
  return !dirty || workingDays.length === 7 || !dateValid || isSaving;
}

/**
 * Save gating for the PER-EMPLOYEE OVERRIDE sheet — split by mode (the
 * 15-8 fix for the add-mode dead end reported on device 2026-09-28):
 *
 *  - ADD mode — the baseline was the visual Sunday preselection, so a
 *    deliberate set EQUAL to the default could never satisfy
 *    dirty-vs-baseline: toggling Sunday off and back on restored the
 *    baseline and re-disabled Save, making e.g. a Sunday-only override
 *    unsavable. Per the 15-6 review decision ("toggle off and back on
 *    enables Save" — shipped without its test), Save now needs only
 *    TOUCHED + a valid override: not all 7 days (FR-18; an EMPTY set is
 *    the works-all-week override and saves), a parseable date, and no
 *    write in flight. The picked-employee requirement stays at the call
 *    site (it is about the target, not the form).
 *
 *  - EDIT mode — unchanged: dirty-vs-current-saved-rule, so a no-op
 *    toggle cannot re-PUT the existing rule.
 */
export function isOverrideSaveDisabled({
  isEdit,
  hasTouched,
  dirty,
  workingDays,
  dateValid,
  isSaving,
}: {
  isEdit: boolean;
  hasTouched: boolean;
  dirty: boolean;
  workingDays: IsoWeekday[];
  dateValid: boolean;
  isSaving: boolean;
}): boolean {
  if (workingDays.length === 7 || !dateValid || isSaving) return true;
  return isEdit ? !dirty : !hasTouched;
}
