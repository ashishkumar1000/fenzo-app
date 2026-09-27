/**
 * formatLongDate — the one long-date formatter for the attendance
 * surfaces ("Wed, 30 Sept, 2026"). Pinned to `en-IN` so the output is
 * identical on every device regardless of the OS locale (Story 15-6
 * review: the previous per-feature copies used the device locale, so
 * the same date could render differently per device and the literal
 * output could not be asserted in tests).
 *
 * Invalid input passes through unchanged; the noon-IST construction
 * keeps the weekday stable for any timezone's midnight roll-over.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatLongDate(yyyyMmDd: string): string {
  if (!ISO_DATE.test(yyyyMmDd)) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}