/**
 * offsetInstant.ts — formatters for tenant-offset ISO instants.
 *
 * Attendance (and later leave) instants travel as ISO-8601 WITH the tenant
 * offset — "2026-09-29T10:22:00+05:30" (AD-7/D11). The app renders the
 * WALL-CLOCK parts verbatim, 12-hour (NFR-5), and NEVER converts: creating
 * a Date and calling toLocaleString would re-render them in the DEVICE's
 * timezone, which is exactly the drift the wire format exists to prevent.
 * So every formatter here is pure string surgery — no Date construction
 * from the instant itself.
 */

/** Extracts the `HH:mm` wall-clock part of an offset ISO instant. */
function wallClockParts(iso: string): { date: string; hh: string; mm: string } | null {
  // "2026-09-29T10:22:00+05:30" → date 2026-09-29, time 10:22.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  return { date: match[1], hh: match[2], mm: match[3] };
}

/** "2026-09-29T10:22:00+05:30" → "10:22 AM" (12-hour, NFR-5). Null when
 *  the string isn't the contracted shape — callers render nothing rather
 *  than a wrong time. */
export function formatOffsetInstantTime(iso: string | null | undefined): string | null {
  const parts = iso ? wallClockParts(iso) : null;
  if (!parts) return null;
  const hour24 = Number(parts.hh);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  return `${hour12}:${parts.mm} ${meridiem}`;
}

/** "2026-09-29T10:22:00+05:30" → "29 Sep 2026" (from the wall-clock date
 *  part; month names are fixed — no locale/timezone involvement). */
export function formatOffsetInstantDate(iso: string | null | undefined): string | null {
  const parts = iso ? wallClockParts(iso) : null;
  if (!parts) return null;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = Number(parts.date.slice(5, 7));
  const day = Number(parts.date.slice(8, 10));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${day} ${monthNames[month - 1]} ${parts.date.slice(0, 4)}`;
}

/** Whole worked minutes → "8 h 08 m" (the PRD's example shape). Zero →
 *  "0 h 00 m"; negative inputs are clamped by the caller's contract, but a
 *  defensive max(0) keeps a corrupt value from rendering "-2 h". */
export function formatWorkedMinutes(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return null;
  }
  const whole = Math.max(0, Math.trunc(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return `${h} h ${String(m).padStart(2, '0')} m`;
}
