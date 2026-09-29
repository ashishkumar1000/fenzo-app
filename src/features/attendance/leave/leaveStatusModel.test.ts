/**
 * Model tests for `leaveStatusModel` (Story 17-6, spec §5): the D6 chip
 * truth table (badge key + label + icon per status, incl. the deliberate
 * grey Cancelled/Revoked), the split suffix (single-state spans render
 * none; the majority non-active state wins; the tie is deterministic),
 * and the range helper (single-day collapse, same-month compression,
 * cross-month same-year, cross-year). The 17-5 count copy re-export is
 * pinned here too — one implementation, two import sites.
 */
import {
  formatLeaveDate,
  formatLeaveRange,
  requestStatusChip,
  splitDaySummary,
  workingDaysCopy,
} from './leaveStatusModel';

describe('requestStatusChip — the D6 truth table', () => {
  it.each([
    ['pending', 'scheduled', 'Pending', 'Clock'],
    ['approved', 'done', 'Approved', 'CheckCircle2'],
    ['rejected', 'cancelled', 'Rejected', 'XCircle'],
    ['cancelled', 'neutral', 'Cancelled', 'CalendarX'],
    ['revoked', 'neutral', 'Revoked', 'Undo2'],
  ])('%s → badge %s, "%s", icon %s', (status, badge, label, icon) => {
    expect(requestStatusChip(status)).toEqual({ badge, label, icon });
  });

  it('red is reserved for Rejected only — Cancelled/Revoked are grey', () => {
    expect(requestStatusChip('cancelled').badge).toBe('neutral');
    expect(requestStatusChip('revoked').badge).toBe('neutral');
    expect(requestStatusChip('rejected').badge).toBe('cancelled');
  });

  it('an off-vocabulary status degrades to a neutral chip carrying the raw word', () => {
    const chip = requestStatusChip('mystery');
    expect(chip.badge).toBe('neutral');
    expect(chip.label).toBe('Mystery');
  });
});

describe('splitDaySummary — the honest split suffix', () => {
  const day = (date: string, state: string) => ({ date, state });

  it('a single-state span renders no suffix (the common case)', () => {
    expect(
      splitDaySummary([day('2026-09-14', 'approved'), day('2026-09-15', 'approved')]),
    ).toBeNull();
  });

  it('an all-active mix (never observable) still renders no suffix', () => {
    expect(
      splitDaySummary([day('2026-09-14', 'pending'), day('2026-09-15', 'approved')]),
    ).toBeNull();
  });

  it('a mixed span names the cancelled majority: "2 of 5 days cancelled"', () => {
    expect(
      splitDaySummary([
        day('2026-09-14', 'cancelled'),
        day('2026-09-15', 'cancelled'),
        day('2026-09-16', 'approved'),
        day('2026-09-17', 'approved'),
        day('2026-09-18', 'approved'),
      ]),
    ).toEqual({
      state: 'cancelled',
      count: 2,
      total: 5,
      label: '2 of 5 days cancelled',
    });
  });

  it('a revoked majority says "revoked"', () => {
    expect(
      splitDaySummary([
        day('2026-09-14', 'revoked'),
        day('2026-09-15', 'revoked'),
        day('2026-09-16', 'revoked'),
        day('2026-09-17', 'approved'),
        day('2026-09-18', 'approved'),
      ])?.label,
    ).toBe('3 of 5 days revoked');
  });

  it('a tie between cancelled and revoked resolves to cancelled (deterministic)', () => {
    expect(
      splitDaySummary([
        day('2026-09-14', 'cancelled'),
        day('2026-09-15', 'revoked'),
        day('2026-09-16', 'approved'),
      ])?.state,
    ).toBe('cancelled');
  });

  it('an empty span renders no suffix', () => {
    expect(splitDaySummary([])).toBeNull();
  });
});

describe('formatLeaveRange — the "{date range}" helper', () => {
  it('a single-day span collapses to one date everywhere', () => {
    expect(formatLeaveRange('2026-09-14', '2026-09-14')).toBe('14 Sep 2026');
    expect(formatLeaveDate('2026-09-14')).toBe('14 Sep 2026');
  });

  it('a same-month span compresses: "14–18 Sep 2026"', () => {
    expect(formatLeaveRange('2026-09-14', '2026-09-18')).toBe('14–18 Sep 2026');
  });

  it('a same-year cross-month span keeps both months', () => {
    expect(formatLeaveRange('2026-09-28', '2026-10-02')).toBe(
      '28 Sep – 2 Oct 2026',
    );
  });

  it('a cross-year span carries both years: "28 Dec 2026 – 2 Jan 2027"', () => {
    expect(formatLeaveRange('2026-12-28', '2027-01-02')).toBe(
      '28 Dec 2026 – 2 Jan 2027',
    );
  });

  it('invalid input passes through unchanged (the formatLongDate rule)', () => {
    expect(formatLeaveDate('not-a-date')).toBe('not-a-date');
    expect(formatLeaveRange('2026-09-14', 'soon')).toBe('14 Sep 2026 – soon');
  });
});

describe('the re-exported 17-5 count copy (one implementation)', () => {
  it('pluralises the server integer, never 0.5', () => {
    expect(workingDaysCopy(1)).toBe('1 working day');
    expect(workingDaysCopy(3)).toBe('3 working days');
  });
});
