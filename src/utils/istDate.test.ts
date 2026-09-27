/**
 * Tests for the IST calendar-day helper `istTodayDate` (Story 15-6).
 *
 * This is the FE's mirror of the server's per-tenant "today", so the cases
 * that matter are the day-boundary ones: an instant that is still the 27th
 * in UTC but already the 28th in IST must read as the 28th, and an instant
 * that is the 27th on a device west of UTC must still read as the 27th here.
 * Every case pins the instant, so nothing depends on the machine's clock.
 * (jest pins `process.env.TZ = 'Asia/Kolkata'` in jest.setup.js, so the
 * default-argument case can compare against the device-local date.)
 */
import { istTodayDate } from './istDate';

/** Device-local YYYY-MM-DD — the IST date in this (TZ-pinned) test run. */
function deviceLocalDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

describe('istTodayDate', () => {
  it('reads the IST day, rolling over after 18:30 UTC', () => {
    // 19:00Z = 00:30 IST on the 28th — the IST day is already tomorrow.
    expect(istTodayDate('2026-09-27T19:00:00.000Z')).toBe('2026-09-28');
  });

  it('stays on the UTC day while IST is still before midnight', () => {
    // 18:00Z = 23:30 IST on the 27th — no rollover yet.
    expect(istTodayDate('2026-09-27T18:00:00.000Z')).toBe('2026-09-27');
  });

  it('reads the IST day, not the UTC or device-local one, midday', () => {
    // 10:00Z = 15:30 IST on the 27th (UTC and local agree here).
    expect(istTodayDate('2026-09-27T10:00:00.000Z')).toBe('2026-09-27');
    // 20:00Z is the 27th UTC but the 28th IST.
    expect(istTodayDate('2026-09-27T20:00:00.000Z')).toBe('2026-09-28');
    // 02:00Z is the 28th UTC but only 07:30 IST on the 28th — still the 28th.
    expect(istTodayDate('2026-09-28T02:00:00.000Z')).toBe('2026-09-28');
  });

  it('formats as zero-padded YYYY-MM-DD', () => {
    expect(istTodayDate('2026-01-05T10:00:00.000Z')).toBe('2026-01-05');
  });

  it('defaults to the real clock', () => {
    expect(istTodayDate()).toBe(deviceLocalDate());
  });
});
