/**
 * reportModel — the pure display/validation vocabulary of the Reports
 * screen (story 12-6). The date tests pin the fixed +5:30 IST shift:
 * `2026-09-20T18:30:00Z` is already `2026-09-21` on the IST wall clock,
 * which is exactly the boundary the future-date gate must not miss.
 */
import {
  MAX_RANGE_DAYS,
  failedReportCopy,
  formatIstDay,
  formatRangeLabel,
  formatRequestedAt,
  isoToPickerDate,
  pickerDateToIso,
  rangeDays,
  statusBadge,
  technicianScopeLabel,
  todayIst,
  validateRange,
} from './reportModel';

describe('todayIst', () => {
  it('rolls a UTC 18:30 instant to the next IST calendar date', () => {
    // 18:30 UTC + 5:30 = midnight IST of the 21st.
    expect(todayIst('2026-09-20T18:30:00.000Z')).toBe('2026-09-21');
  });

  it('keeps the same calendar date one second before the boundary', () => {
    expect(todayIst('2026-09-20T18:29:59.999Z')).toBe('2026-09-20');
  });

  it('maps a mid-day instant to its same-day IST date', () => {
    expect(todayIst('2026-09-20T06:00:00.000Z')).toBe('2026-09-20');
    expect(todayIst('2026-09-20T12:00:00.000Z')).toBe('2026-09-20');
  });
});

describe('pickerDateToIso / isoToPickerDate', () => {
  it('round-trips a picker Date through the YYYY-MM-DD string', () => {
    const picked = isoToPickerDate('2026-09-20');
    expect(pickerDateToIso(picked)).toBe('2026-09-20');
  });

  it('reads the local (IST) calendar fields — a local midnight on the 20th is the 20th', () => {
    // The picker hands back a local-midnight Date; with the tests pinned to
    // Asia/Kolkata, the local fields ARE the IST calendar date.
    expect(pickerDateToIso(new Date(2026, 8, 20))).toBe('2026-09-20');
  });

  it('zero-pads month and day', () => {
    expect(pickerDateToIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('builds a local-midnight Date whose calendar fields match the string', () => {
    const d = isoToPickerDate('2026-01-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
  });
});

describe('rangeDays', () => {
  it('is inclusive of both ends — same day is 1, not 0', () => {
    expect(rangeDays('2026-09-20', '2026-09-20')).toBe(1);
  });

  it('counts a simple week as 7', () => {
    expect(rangeDays('2026-09-01', '2026-09-07')).toBe(7);
  });

  it('spans a month boundary correctly', () => {
    // 25–31 Aug (7) + 1–5 Sep (5) = 12 inclusive days.
    expect(rangeDays('2026-08-25', '2026-09-05')).toBe(12);
  });

  it('counts the leap day of a leap year', () => {
    // 28 Feb, 29 Feb, 1 Mar — inclusive.
    expect(rangeDays('2024-02-28', '2024-03-01')).toBe(3);
  });

  it('counts a non-leap February as 28 days', () => {
    expect(rangeDays('2025-02-01', '2025-02-28')).toBe(28);
  });

  it('returns NaN when either date is not a real calendar date', () => {
    expect(rangeDays('not-a-date', '2026-09-20')).toBeNaN();
    expect(rangeDays('2026-09-20', 'not-a-date')).toBeNaN();
  });
});

describe('validateRange', () => {
  const now = '2026-09-20T10:00:00.000Z'; // mid-day IST on 2026-09-20

  it('accepts an all-valid range', () => {
    expect(validateRange('2026-09-01', '2026-09-20', now)).toBeNull();
  });

  it('rejects a missing date', () => {
    expect(validateRange('', '2026-09-20', now)).toBe('Pick both dates');
    expect(validateRange('2026-09-01', '', now)).toBe('Pick both dates');
  });

  it('rejects a reversed range', () => {
    expect(validateRange('2026-09-20', '2026-09-01', now)).toBe(
      'End date is before the start date',
    );
  });

  it('rejects an end date in the future on the IST clock', () => {
    // 2026-09-20T18:30Z is tomorrow in IST, so an end on the 21st is future
    // even though the UTC instant is still "today" in UTC terms.
    expect(validateRange('2026-09-01', '2026-09-21', now)).toBe(
      'End date cannot be in the future',
    );
  });

  it('accepts today as the end date (the IST clock says it is not future)', () => {
    expect(validateRange('2026-09-01', '2026-09-20', now)).toBeNull();
    // Even just after the 18:30 UTC boundary, when IST has already moved on.
    expect(validateRange('2026-09-01', '2026-09-21', '2026-09-20T18:30:00.000Z')).toBeNull();
  });

  it('accepts a 92-day range exactly and rejects 93 (inclusive cap)', () => {
    // 21 Jun → 20 Sep inclusive = 10 + 31 + 31 + 20 = 92.
    expect(rangeDays('2026-06-21', '2026-09-20')).toBe(92);
    expect(validateRange('2026-06-21', '2026-09-20', now)).toBeNull();
    expect(validateRange('2026-06-20', '2026-09-20', now)).toBe(
      'Pick a range of 92 days or less',
    );
    expect(MAX_RANGE_DAYS).toBe(92);
  });
});

describe('statusBadge', () => {
  it('maps queued to the Scheduled badge', () => {
    expect(statusBadge('queued')).toEqual({ status: 'scheduled', label: 'Queued' });
  });

  it('maps generating to the In Progress badge', () => {
    expect(statusBadge('generating')).toEqual({ status: 'progress', label: 'Generating' });
  });

  it('maps ready to the Done badge', () => {
    expect(statusBadge('ready')).toEqual({ status: 'done', label: 'Ready' });
  });

  it('maps failed to the Cancelled badge', () => {
    expect(statusBadge('failed')).toEqual({ status: 'cancelled', label: 'Failed' });
  });
});

describe('failedReportCopy', () => {
  it('maps each known engine code to its friendly line', () => {
    expect(failedReportCopy('REPORT_RANGE_TOO_LARGE')).toBe(
      'That date range is too long. Try 92 days or less.',
    );
    expect(failedReportCopy('REPORT_TOO_LARGE')).toBe(
      'Too many jobs in this range. Try a shorter one.',
    );
    expect(failedReportCopy('REPORT_GENERATION_FAILED')).toBe(
      'We could not build this report. Try again.',
    );
    expect(failedReportCopy('REPORT_PRESIGN_FAILED')).toBe(
      'The report file could not be opened. Try again shortly.',
    );
  });

  it('falls back to the generic line for null, undefined and unknown codes', () => {
    expect(failedReportCopy(null)).toBe('This report failed. Try requesting it again.');
    expect(failedReportCopy(undefined)).toBe('This report failed. Try requesting it again.');
    expect(failedReportCopy('SOMETHING_ELSE')).toBe(
      'This report failed. Try requesting it again.',
    );
  });
});

describe('formatIstDay', () => {
  it('formats a calendar date as `D Mon` without leading zeros', () => {
    expect(formatIstDay('2026-09-20')).toBe('20 Sep');
    expect(formatIstDay('2026-01-05')).toBe('5 Jan');
  });
});

describe('formatRangeLabel', () => {
  it('formats as `1 Sep – 7 Sep 2026` (year taken from the end date)', () => {
    expect(formatRangeLabel('2026-09-01', '2026-09-07')).toBe('1 Sep – 7 Sep 2026');
  });

  it('keeps the year of the end date across a year boundary', () => {
    expect(formatRangeLabel('2025-12-28', '2026-01-03')).toBe('28 Dec – 3 Jan 2026');
  });
});

describe('formatRequestedAt', () => {
  it('renders the instant on the IST clock as `8 Sep, 4:05 PM`', () => {
    // 10:35 UTC + 5:30 = 16:05 IST.
    expect(formatRequestedAt('2026-09-08T10:35:00.000Z')).toBe('8 Sep, 4:05 PM');
  });

  it('rolls a late-evening UTC instant into the next IST morning as 12:00 AM', () => {
    // 18:30 UTC + 5:30 = 00:00 IST on the 9th.
    expect(formatRequestedAt('2026-09-08T18:30:00.000Z')).toBe('9 Sep, 12:00 AM');
  });

  it('formats IST noon as 12:00 PM', () => {
    // 06:30 UTC + 5:30 = 12:00 IST.
    expect(formatRequestedAt('2026-09-08T06:30:00.000Z')).toBe('8 Sep, 12:00 PM');
  });
});

describe('technicianScopeLabel', () => {
  it('says All technicians when the selection is empty (null)', () => {
    expect(technicianScopeLabel(null)).toBe('All technicians');
  });

  it('uses the singular for one technician', () => {
    expect(technicianScopeLabel(1)).toBe('1 technician');
  });

  it('uses the plural for more than one', () => {
    expect(technicianScopeLabel(3)).toBe('3 technicians');
    expect(technicianScopeLabel(12)).toBe('12 technicians');
  });
});