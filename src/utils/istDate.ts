/**
 * utils/istDate.ts
 * ────────────────
 * Day math in IST (UTC+5:30), hand-built — Story 1.5.
 *
 * Why not `toLocaleTimeString('en-IN', …)` / `Intl` like the per-feature
 * formatters (`features/jobs/format.ts`, `features/customers/format.ts`):
 * those are device-TZ-naive (`en-IN` is a locale, not a timezone) and Hermes
 * ships incomplete Intl. IST has no DST and a fixed offset, so shifting a
 * timestamp by +5:30 and reading the *UTC* fields gives the true IST wall
 * clock — that is all this file does, without Intl.
 *
 * Every function takes an optional `nowIso` (default: the real clock) so
 * tests can pin fixed timestamps instead of depending on the host machine's
 * timezone or current time — jest runs in the host TZ, not IST.
 *
 * Pure functions only. Do NOT reuse the per-feature time formatters for day
 * math (see the story's Dev Notes) and do NOT add a date library for this.
 */

/** IST is fixed at UTC+5:30 — no DST, ever. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The timestamp's IST "day index" — days since 1970-01-01 counted at the IST
 * midnight boundary. Subtracting two indexes gives whole-day differences
 * that survive any wall-clock hour (e.g. a job booked 23:30 IST today is 0
 * days from one booked 00:01 IST tomorrow → 1).
 */
function istDayIndex(iso: string): number {
  return Math.floor((Date.parse(iso) + IST_OFFSET_MS) / MS_PER_DAY);
}

/** Today's ISO instant, injectable so tests pin the clock. */
function defaultNowIso(): string {
  return new Date().toISOString();
}

/**
 * Epoch milliseconds of IST midnight (00:00 IST) on the day of `nowIso`.
 * Used by tests to build fixtures at a controlled IST day — add multiples of
 * 86_400_000 to step days.
 */
export function istDayStartMs(nowIso: string = defaultNowIso()): number {
  return (Math.floor((Date.parse(nowIso) + IST_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY) - IST_OFFSET_MS;
}

/**
 * Whole days the IST day of `iso` falls before the IST day of `now` —
 * 0 means "today" (not overdue, even if earlier today), 1 means "yesterday"
 * (→ "1 day overdue"), negative means future (also 0 here; the Overdue scope
 * never contains future jobs, so callers badge only what the server returns).
 */
export function daysOverdue(iso: string, nowIso: string = defaultNowIso()): number {
  return Math.max(0, istDayIndex(nowIso) - istDayIndex(iso));
}

/** True when both timestamps fall on the same IST day. */
export function isSameIstDay(iso: string, nowIso: string = defaultNowIso()): boolean {
  return istDayIndex(iso) === istDayIndex(nowIso);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The scheduled date as a short IST label for the Upcoming/Overdue meta rows,
 * e.g. `5 Sep` — or `5 Sep 2027` when the year differs from today's. Read
 * from the UTC fields of the +5:30-shifted timestamp, so the label is the
 * IST wall-clock date regardless of the device's timezone.
 */
export function formatIstDateLabel(iso: string, nowIso: string = defaultNowIso()): string {
  const shifted = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const day = shifted.getUTCDate();
  const month = MONTHS[shifted.getUTCMonth()];
  const year = shifted.getUTCFullYear();
  const label = `${day} ${month}`;
  return year === new Date(Date.parse(nowIso) + IST_OFFSET_MS).getUTCFullYear()
    ? label
    : `${label} ${year}`;
}
