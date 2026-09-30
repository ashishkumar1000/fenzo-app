/**
 * Tests for the monthly view's pure model (Story 19-5, spec §5.1-5.2): the
 * verbatim `shiftYearMonth` extraction (year wraps both ways), the ONE
 * shared month-name table, the fetch-window clamp (a past month is a
 * no-op; the current month clamps to today), the decimal credit
 * formatter, the chips build (order + zero-suppression + singular/plural),
 * the caption segments (empty-line omission) and the EXACT row
 * accessibilityLabel string (commas, never "·" — TalkBack reads the dot).
 *
 * QA stance: these pin the requirement's behaviour — if the model changed
 * but the FR-25 contract did not, these must still pass.
 */
import type {
  EmployeeMonthlyRow,
  MonthlyEmployeeSummary,
} from '../../../services/resources/attendanceMonthly';
import {
  captionSegments,
  formatCredit,
  formatHolidayShortDate,
  monthlyCaption,
  monthlyRowA11yLabel,
  monthlyWindow,
  monthTitle,
  shiftYearMonth,
  summaryChips,
  summaryMetaSegments,
} from './monthlyModel';

/** A wire-valid row — override any field per test. */
function row(overrides: {
  employeeId?: string;
  employeeName?: string;
  officeId?: string | null;
  officeName?: string | null;
  summary?: Partial<EmployeeMonthlyRow['summary']>;
} = {}): EmployeeMonthlyRow {
  return {
    employeeId: overrides.employeeId ?? 'e1',
    employeeName: overrides.employeeName ?? 'Asha',
    // The office pair is NULLABLE on the wire — an explicit null must win
    // over the default (?? would coerce it back to a name).
    officeId: overrides.officeId !== undefined ? overrides.officeId : 'o1',
    officeName: overrides.officeName !== undefined ? overrides.officeName : 'Andheri West',
    summary: {
      daysWorked: 18,
      halfDays: 2,
      lateCount: 1,
      leave: 1.5,
      weeklyOffs: 4,
      holidays: 1,
      workedOnHoliday: 0,
      absent: 1,
      checkoutMissing: 3,
      ...overrides.summary,
    },
  };
}

describe('shiftYearMonth (the lab original, verbatim)', () => {
  it('shifts within a year', () => {
    expect(shiftYearMonth('2026-05', -1)).toBe('2026-04');
    expect(shiftYearMonth('2026-05', 1)).toBe('2026-06');
    expect(shiftYearMonth('2026-05', 0)).toBe('2026-05');
  });

  it('wraps the year both ways', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2025-12', 2)).toBe('2026-02');
  });

  it('pads the single-digit month', () => {
    expect(shiftYearMonth('2026-02', -1)).toBe('2026-01');
    expect(shiftYearMonth('2026-03', -1)).toBe('2026-02');
  });
});

describe('monthTitle (the ONE shared table)', () => {
  it('names the month with the year — "September 2026"', () => {
    expect(monthTitle('2026-09')).toBe('September 2026');
    expect(monthTitle('2026-01')).toBe('January 2026');
    expect(monthTitle('2025-12')).toBe('December 2025');
  });
});

describe('monthlyWindow (the clamp)', () => {
  it('a past month is a no-op clamp (the full month range)', () => {
    expect(monthlyWindow('2026-08', '2026-09-30')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('the current month clamps to to = today', () => {
    expect(monthlyWindow('2026-09', '2026-09-15')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
  });

  it('clamps mid-month only — a month ending before today keeps its last day', () => {
    expect(monthlyWindow('2026-02', '2026-09-30')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('formatCredit', () => {
  it('an integer renders bare', () => {
    expect(formatCredit(18)).toBe('18');
    expect(formatCredit(0)).toBe('0');
  });

  it('a decimal keeps its place (17.5 is legal, FR-11)', () => {
    expect(formatCredit(17.5)).toBe('17.5');
    expect(formatCredit(0.5)).toBe('0.5');
    expect(formatCredit(2)).not.toBe('2.0');
  });
});

describe('summaryChips', () => {
  it('orders worked first, then the > 0 chips in D4 order', () => {
    const chips = summaryChips(row().summary);
    expect(chips.map(c => [c.key, c.label])).toEqual([
      ['daysWorked', '18 worked'],
      ['halfDays', '2 half days'],
      ['lateCount', '1 late'],
      ['leave', '1.5 leave'],
      ['absent', '1 absent'],
      ['checkoutMissing', '3 missing checkouts'],
    ]);
  });

  it('suppresses zeros EXCEPT the worked anchor', () => {
    const chips = summaryChips(
      row({ summary: { daysWorked: 0, halfDays: 0, lateCount: 0, leave: 0, absent: 0, checkoutMissing: 0 } })
        .summary,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]).toEqual({ key: 'daysWorked', label: '0 worked' });
  });

  it('uses the singular noun at 1 (half day / missing checkout)', () => {
    const chips = summaryChips(
      row({
        summary: {
          halfDays: 1,
          lateCount: 1,
          leave: 0,
          absent: 0,
          checkoutMissing: 1,
        },
      }).summary,
    );
    expect(chips.map(c => c.label)).toEqual([
      '18 worked',
      '1 half day',
      '1 late',
      '1 missing checkout',
    ]);
  });

  it('formats decimal worked/leave through formatCredit', () => {
    const chips = summaryChips(
      row({ summary: { daysWorked: 17.5, leave: 2.5 } }).summary,
    );
    expect(chips[0].label).toBe('17.5 worked');
    expect(chips.find(c => c.key === 'leave')!.label).toBe('2.5 leave');
  });
});

describe('formatHolidayShortDate (19-6 — the «d MMM» surgery)', () => {
  it('renders the bare day plus the short month from the ONE table', () => {
    expect(formatHolidayShortDate('2026-10-02')).toBe('2 Oct');
    expect(formatHolidayShortDate('2026-09-14')).toBe('14 Sep');
    expect(formatHolidayShortDate('2026-01-26')).toBe('26 Jan');
    expect(formatHolidayShortDate('2026-12-25')).toBe('25 Dec');
  });

  it('drops the leading zero on single-digit days', () => {
    expect(formatHolidayShortDate('2026-08-05')).toBe('5 Aug');
  });
});

describe('summaryMetaSegments (19-6 — the shared count segments)', () => {
  it('builds weekly offs → holidays → worked-on-holiday, sharing plural/formatCredit', () => {
    expect(
      summaryMetaSegments(
        row({ summary: { weeklyOffs: 4, holidays: 1, workedOnHoliday: 1 } }).summary,
      ),
    ).toEqual(['4 weekly offs', '1 holiday', '1 worked on holiday']);
  });

  it('suppresses zeros and singularises at 1', () => {
    const summary: Partial<MonthlyEmployeeSummary> = {
      weeklyOffs: 1,
      holidays: 0,
      workedOnHoliday: 2.5,
    };
    expect(summaryMetaSegments(row({ summary }).summary)).toEqual([
      '1 weekly off',
      '2.5 worked on holiday',
    ]);
  });

  it('all zero → the empty array (the line is omitted)', () => {
    expect(
      summaryMetaSegments(
        row({ summary: { weeklyOffs: 0, holidays: 0, workedOnHoliday: 0 } }).summary,
      ),
    ).toEqual([]);
  });
});

describe('captionSegments + monthlyCaption', () => {
  it('builds office → weekly offs → holidays → worked-on-holiday', () => {
    const segments = captionSegments(
      row({ summary: { weeklyOffs: 4, holidays: 1, workedOnHoliday: 1 } }),
    );
    expect(segments).toEqual([
      'Andheri West',
      '4 weekly offs',
      '1 holiday',
      '1 worked on holiday',
    ]);
    expect(monthlyCaption(row())).toBe('Andheri West · 4 weekly offs · 1 holiday');
  });

  it('uses the singular noun at 1 (weekly off)', () => {
    expect(captionSegments(row({ summary: { weeklyOffs: 1, holidays: 2 } }))).toEqual([
      'Andheri West',
      '1 weekly off',
      '2 holidays',
    ]);
  });

  it('the nullable office drops out silently', () => {
    expect(
      captionSegments(
        row({
          officeId: null,
          officeName: null,
          summary: { weeklyOffs: 2, holidays: 0 },
        }),
      ),
    ).toEqual(['2 weekly offs']);
  });

  it('suppresses zero segments', () => {
    expect(
      captionSegments(
        row({ officeName: null, summary: { weeklyOffs: 0, holidays: 0, workedOnHoliday: 0 } }),
      ),
    ).toEqual([]);
  });

  it('the whole caption line is omitted when every segment is absent', () => {
    expect(
      monthlyCaption(
        row({ officeName: null, summary: { weeklyOffs: 0, holidays: 0, workedOnHoliday: 0 } }),
      ),
    ).toBe('');
  });

  it('19-6: captionSegments is byte-identical after the summaryMetaSegments refactor', () => {
    // The owner output must not move by one byte when the segments split
    // out (the 19-6 D5 ruling) — the full row, the nullable office, the
    // all-zero row.
    expect(captionSegments(row({ summary: { workedOnHoliday: 1 } }))).toEqual([
      'Andheri West',
      '4 weekly offs',
      '1 holiday',
      '1 worked on holiday',
    ]);
    expect(monthlyCaption(row({ summary: { workedOnHoliday: 1 } }))).toBe(
      'Andheri West · 4 weekly offs · 1 holiday · 1 worked on holiday',
    );
    expect(
      captionSegments(
        row({ officeId: null, officeName: null, summary: { weeklyOffs: 2, holidays: 0 } }),
      ),
    ).toEqual(['2 weekly offs']);
    expect(
      captionSegments(
        row({ officeName: null, summary: { weeklyOffs: 0, holidays: 0, workedOnHoliday: 0 } }),
      ),
    ).toEqual([]);
  });
});

describe('monthlyRowA11yLabel (the exact pinned string)', () => {
  it('the full variant — commas never "·", caption as the last sentence', () => {
    expect(
      monthlyRowA11yLabel(
        row({ summary: { workedOnHoliday: 1 } }),
      ),
    ).toBe(
      'Asha. 18 worked, 2 half days, 1 late, 1.5 leave, 1 absent, 3 missing checkouts. '
        + 'Andheri West, 4 weekly offs, 1 holiday, 1 worked on holiday',
    );
  });

  it('zero-suppressed segments drop out of the label', () => {
    expect(
      monthlyRowA11yLabel(
        row({
          employeeName: 'Ben',
          summary: {
            daysWorked: 0,
            halfDays: 0,
            lateCount: 0,
            leave: 0,
            absent: 0,
            checkoutMissing: 0,
            weeklyOffs: 0,
            holidays: 0,
            workedOnHoliday: 0,
          },
          officeName: null,
          officeId: null,
        }),
      ),
    ).toBe('Ben. 0 worked');
  });

  it('omits the caption sentence entirely when empty (no dangling period)', () => {
    expect(
      monthlyRowA11yLabel(
        row({
          officeName: null,
          summary: { weeklyOffs: 0, holidays: 0, workedOnHoliday: 0 },
        }),
      ),
    ).toBe('Asha. 18 worked, 2 half days, 1 late, 1.5 leave, 1 absent, 3 missing checkouts');
  });

  it('the caption sentence keeps the nullable-office drop and plural nouns', () => {
    expect(
      monthlyRowA11yLabel(
        row({
          officeId: null,
          officeName: null,
          summary: { halfDays: 1, lateCount: 0, leave: 0, absent: 0, checkoutMissing: 0, weeklyOffs: 1, holidays: 0, workedOnHoliday: 0 },
        }),
      ),
    ).toBe('Asha. 18 worked, 1 half day. 1 weekly off');
  });
});
