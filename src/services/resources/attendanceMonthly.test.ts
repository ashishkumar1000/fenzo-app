/**
 * Tests for the FR-25 monthly service (Story 19-5, spec §5.1): the exact
 * URL/params of the read (from/to ALWAYS, the RAW officeId encoded once by
 * apiClient — the 19-4 double-encode lesson); the FAIL-CLOSED normalizer —
 * one bad field rejects the WHOLE fetch (a partially-trusted row would
 * render a confidently wrong month); `today` is REQUIRED and regex-checked
 * (the dashboard `date`-echo rule — the clamp is load-bearing request
 * math, so absence is drift, not an older BE); the nullable office pair
 * passes through as display-only nulls.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import {
  fetchMonthly,
  fetchMyMonthly,
  normalizeMonthly,
  normalizeMyMonthly,
  normalizeSummary,
} from './attendanceMonthly';

const get = apiClient.get as jest.Mock;

/** A full valid envelope — every field the wire owes (D2's today included). */
function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from: '2026-08-01',
    to: '2026-08-31',
    today: '2026-09-30',
    employees: [
      {
        employeeId: 'e1',
        employeeName: 'Asha',
        officeId: 'o1',
        officeName: 'Andheri West',
        summary: {
          daysWorked: 17.5,
          halfDays: 2,
          lateCount: 1,
          leave: 1.5,
          weeklyOffs: 4,
          holidays: 1,
          workedOnHoliday: 0.5,
          absent: 1,
          checkoutMissing: 3,
        },
      },
    ],
    ...overrides,
  };
}

function employeeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 'e1',
    employeeName: 'Asha',
    officeId: 'o1',
    officeName: 'Andheri West',
    summary: {
      daysWorked: 18,
      halfDays: 0,
      lateCount: 0,
      leave: 0,
      weeklyOffs: 0,
      holidays: 0,
      workedOnHoliday: 0,
      absent: 0,
      checkoutMissing: 0,
    },
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockResolvedValueOnce
  // would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('fetchMonthly (route)', () => {
  it('GETs /attendance/monthly with from+to always, bare for All offices', async () => {
    get.mockResolvedValueOnce({ data: envelope() });
    await fetchMonthly('2026-08-01', '2026-08-31');
    expect(get).toHaveBeenCalledWith('/attendance/monthly', {
      params: { from: '2026-08-01', to: '2026-08-31' },
    });
  });

  it('passes the RAW officeId param — apiClient encodes the emitted URL exactly once', async () => {
    // The service must NOT pre-encode: apiClient's paramsSerializer
    // percent-encodes params itself (the 19-4 lesson). Pin the raw value
    // reaching apiClient.
    get.mockResolvedValueOnce({ data: envelope() });
    await fetchMonthly('2026-08-01', '2026-08-31', 'o 1/a');
    expect(get).toHaveBeenCalledWith('/attendance/monthly', {
      params: { from: '2026-08-01', to: '2026-08-31', officeId: 'o 1/a' },
    });
  });
});

describe('fetchMonthly (happy path)', () => {
  it('passes the nine summary numbers + the three echoes through', async () => {
    get.mockResolvedValueOnce({ data: envelope() });
    const res = await fetchMonthly('2026-08-01', '2026-08-31');
    expect(res.from).toBe('2026-08-01');
    expect(res.to).toBe('2026-08-31');
    expect(res.today).toBe('2026-09-30');
    expect(res.employees).toHaveLength(1);
    expect(res.employees[0].summary).toEqual({
      daysWorked: 17.5,
      halfDays: 2,
      lateCount: 1,
      leave: 1.5,
      weeklyOffs: 4,
      holidays: 1,
      workedOnHoliday: 0.5,
      absent: 1,
      checkoutMissing: 3,
    });
  });

  it('keeps rows in WIRE order (roster order — the FE never re-sorts)', async () => {
    const second = employeeRow({ employeeId: 'e2', employeeName: 'Ben' });
    get.mockResolvedValueOnce({
      data: envelope({ employees: [employeeRow(), second] }),
    });
    const res = await fetchMonthly('2026-08-01', '2026-08-31');
    expect(res.employees.map(r => r.employeeName)).toEqual(['Asha', 'Ben']);
  });

  it('zero rows are legitimate data (an unknown-but-well-formed officeId)', async () => {
    get.mockResolvedValueOnce({ data: envelope({ employees: [] }) });
    const res = await fetchMonthly('2026-08-01', '2026-08-31', 'o-none');
    expect(res.employees).toEqual([]);
  });
});

describe('normalizeMonthly — the nullable office pair', () => {
  it('passes nulls through — the removed-assignment row still renders', () => {
    const res = normalizeMonthly(
      envelope({ employees: [employeeRow({ officeId: null, officeName: null })] }),
    );
    expect(res.employees[0].officeId).toBeNull();
    expect(res.employees[0].officeName).toBeNull();
  });

  it('strips untrusted extras from the row and the summary', () => {
    const res = normalizeMonthly(envelope({
      employees: [
        employeeRow({
          deviceCount: 2,
          summary: {
            ...(employeeRow().summary as Record<string, unknown>),
            note: 'extra',
          },
        }),
      ],
    }));
    expect(res.employees[0]).toEqual({
      employeeId: 'e1',
      employeeName: 'Asha',
      officeId: 'o1',
      officeName: 'Andheri West',
      summary: {
        daysWorked: 18,
        halfDays: 0,
        lateCount: 0,
        leave: 0,
        weeklyOffs: 0,
        holidays: 0,
        workedOnHoliday: 0,
        absent: 0,
        checkoutMissing: 0,
      },
    });
  });

  it('zero credits are legitimate data, not absence', () => {
    const res = normalizeMonthly(envelope({ employees: [employeeRow()] }));
    expect(res.employees[0].summary.daysWorked).toBe(18);
  });
});

describe('normalizeMonthly — fail-closed envelope', () => {
  const base = employeeRow() as Record<string, unknown>;
  const badEmployees = (row: unknown) => envelope({ employees: [row] });

  const cases: Array<[string, unknown]> = [
    ['the response is not an object', null],
    ['the response is an array', []],
    ['the from echo is missing', envelope({ from: undefined })],
    ['the to echo is not ISO', envelope({ to: '2026-8-31' })],
    ['the today echo is missing', envelope({ today: undefined })],
    ['the today echo is not a string', envelope({ today: 20260930 })],
    ['employees is missing', envelope({ employees: undefined })],
    ['employees is not a list', envelope({ employees: 'nobody' })],
    ['an employees row is not an object', badEmployees('Asha')],
    ['an employees row is missing its employeeId', badEmployees({ ...base, employeeId: undefined })],
    ['an employees row has an empty employeeName', badEmployees({ ...base, employeeName: '' })],
    ['an employees row carries a malformed officeId (empty string)', badEmployees({ ...base, officeId: '' })],
    ['an employees row carries a non-string officeName', badEmployees({ ...base, officeName: 42 })],
    ['the summary is missing', badEmployees({ ...base, summary: undefined })],
    ['the summary is not an object', badEmployees({ ...base, summary: 'busy' })],
    ['a summary is missing keys', badEmployees({
      ...base,
      summary: { daysWorked: 1, halfDays: 0, lateCount: 0, leave: 0, weeklyOffs: 0, holidays: 0, workedOnHoliday: 0, absent: 0 },
    })],
    ['a count is a string', badEmployees({ ...base, summary: { ...(base.summary as Record<string, unknown>), halfDays: '2' } })],
    ['a count is fractional', badEmployees({ ...base, summary: { ...(base.summary as Record<string, unknown>), lateCount: 1.5 } })],
    ['a count is negative', badEmployees({ ...base, summary: { ...(base.summary as Record<string, unknown>), absent: -1 } })],
    ['a decimal credit is a string', badEmployees({ ...base, summary: { ...(base.summary as Record<string, unknown>), daysWorked: '18' } })],
    ['a decimal credit is negative', badEmployees({ ...base, summary: { ...(base.summary as Record<string, unknown>), leave: -0.5 } })],
  ];

  for (const [name, bad] of cases) {
    it(`throws on ${name} — never a partially-trusted month`, () => {
      expect(() => normalizeMonthly(bad)).toThrow('monthly:');
    });
  }

  it('rejects the whole fetch on a non-finite decimal credit', async () => {
    get.mockResolvedValueOnce({
      data: envelope({
        employees: [
          employeeRow({
            summary: { ...(base.summary as object), workedOnHoliday: Infinity },
          }),
        ],
      }),
    });
    await expect(fetchMonthly('2026-08-01', '2026-08-31')).rejects.toThrow(
      'monthly:',
    );
  });
});

/** The FR-26 self envelope (19-6 D3) — the same summary shape, me-scoped. */
function meEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    today: '2026-09-30',
    summary: {
      daysWorked: 14.5,
      halfDays: 2,
      lateCount: 1,
      leave: 1,
      weeklyOffs: 3,
      holidays: 1,
      workedOnHoliday: 0,
      absent: 1,
      checkoutMissing: 2,
    },
    weeklyOffs: [7],
    upcomingHolidays: [{ holidayDate: '2026-10-02', holidayName: 'Gandhi Jayanti' }],
    ...overrides,
  };
}

describe('fetchMyMonthly (19-6 D3 — the self read)', () => {
  it('GETs /attendance/me/monthly with from+to and NO employeeId param (the JWT is the key)', async () => {
    get.mockResolvedValueOnce({ data: meEnvelope() });
    await fetchMyMonthly('2026-09-01', '2026-09-15');
    expect(get).toHaveBeenCalledWith('/attendance/me/monthly', {
      params: { from: '2026-09-01', to: '2026-09-15' },
    });
    const params = get.mock.calls[0][1].params as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(['from', 'to']);
  });

  it('passes the nine summary numbers, the echoes, weekly offs and holiday rows through', async () => {
    get.mockResolvedValueOnce({ data: meEnvelope() });
    const res = await fetchMyMonthly('2026-09-01', '2026-09-30');
    expect(res.today).toBe('2026-09-30');
    expect(res.summary).toEqual(meEnvelope().summary);
    expect(res.weeklyOffs).toEqual([7]);
    expect(res.upcomingHolidays).toEqual([
      { holidayDate: '2026-10-02', holidayName: 'Gandhi Jayanti' },
    ]);
  });

  it('empty weeklyOffs / upcomingHolidays are legitimate data', async () => {
    get.mockResolvedValueOnce({
      data: meEnvelope({ weeklyOffs: [], upcomingHolidays: [] }),
    });
    const res = await fetchMyMonthly('2026-09-01', '2026-09-30');
    expect(res.weeklyOffs).toEqual([]);
    expect(res.upcomingHolidays).toEqual([]);
  });

  it('sorts weeklyOffs ascending regardless of wire order', () => {
    const res = normalizeMyMonthly(meEnvelope({ weeklyOffs: [7, 1, 3] }));
    expect(res.weeklyOffs).toEqual([1, 3, 7]);
  });
});

describe('normalizeMyMonthly — fail-closed (19-6 D3)', () => {
  const cases: Array<[string, unknown]> = [
    ['the response is not an object', null],
    ['the from echo is missing', meEnvelope({ from: undefined })],
    ['the to echo is not ISO', meEnvelope({ to: '2026-9-30' })],
    ['the today echo is missing', meEnvelope({ today: undefined })],
    ['the today echo is malformed', meEnvelope({ today: '20260930' })],
    ['the summary is missing', meEnvelope({ summary: undefined })],
    [
      'a summary count is fractional (the shared validator rule)',
      meEnvelope({ summary: { ...(meEnvelope().summary as object), lateCount: 1.5 } }),
    ],
    ['weeklyOffs is missing', meEnvelope({ weeklyOffs: undefined })],
    ['weeklyOffs is not a list', meEnvelope({ weeklyOffs: 'Sundays' })],
    ['a weekly off is 0', meEnvelope({ weeklyOffs: [0] })],
    ['a weekly off is 8', meEnvelope({ weeklyOffs: [8] })],
    ['a weekly off is fractional', meEnvelope({ weeklyOffs: [1.5] })],
    ['upcomingHolidays is missing', meEnvelope({ upcomingHolidays: undefined })],
    ['upcomingHolidays is not a list', meEnvelope({ upcomingHolidays: {} })],
    ['an upcomingHolidays row is not an object', meEnvelope({ upcomingHolidays: ['Diwali'] })],
    [
      'an upcomingHolidays row has an empty holidayName',
      meEnvelope({ upcomingHolidays: [{ holidayDate: '2026-11-08', holidayName: '' }] }),
    ],
    [
      'an upcomingHolidays row has a malformed holidayDate',
      meEnvelope({ upcomingHolidays: [{ holidayDate: '08/11/2026', holidayName: 'Diwali' }] }),
    ],
  ];

  for (const [name, bad] of cases) {
    it(`throws on ${name} — never a partially-trusted self month`, () => {
      expect(() => normalizeMyMonthly(bad)).toThrow('monthly:');
    });
  }

  it('the summary validator is the SAME function the owner path uses (one implementation)', () => {
    // The import pin (spec §5.1): normalizeSummary is exported once and
    // both normalizers call it — a fork would let the two surfaces drift.
    expect(typeof normalizeSummary).toBe('function');
    expect(() => normalizeSummary({ daysWorked: '18' })).toThrow('monthly:');
    expect(() =>
      normalizeSummary({
        daysWorked: 18,
        halfDays: 0,
        lateCount: 0,
        leave: 0,
        weeklyOffs: 0,
        holidays: 0,
        workedOnHoliday: 0,
        absent: 0,
        checkoutMissing: 0,
      }),
    ).not.toThrow();
  });
});
