/**
 * Tests for the FR-24 dashboard service (Story 19-4, spec §5.2 + the 19-4
 * redesign's optional-`offices` doctrine): the exact URL/params of the
 * read (bare route for All offices, URL-encoded officeId for a filter);
 * the FAIL-CLOSED normalizer — one bad field rejects the WHOLE fetch
 * (a partially-trusted envelope would render a confidently wrong summary);
 * the `offices` field is OPTIONAL (absent = an older deployed BE → null,
 * a version difference, not an error) but PRESENT-BUT-MALFORMED still
 * fails closed; attemptCount appears ONLY on fake-location rows (the wire
 * is whitelisted — an untrusted extra never rides into the UI).
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { fetchDashboard, normalizeDashboard } from './attendanceDashboard';

const get = apiClient.get as jest.Mock;

/** A full valid envelope — every field the wire owes. */
function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2026-09-30',
    counts: {
      tracked: 3,
      checkedIn: 2,
      notCheckedIn: 1,
      late: 0,
      onLeave: 1,
    },
    flags: { checkoutMissing: [], fakeLocationAttempt: [] },
    ...overrides,
  };
}

function flagRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 'e1',
    employeeName: 'Arya',
    workDate: '2026-09-14',
    officeName: 'Hero wala',
    ...overrides,
  };
}

function officeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'o1', name: 'Hero wala', tracked: 3, checkedIn: 2, ...overrides };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockResolvedValueOnce
  // would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('fetchDashboard (route)', () => {
  it('GETs /attendance/dashboard bare for All offices', async () => {
    get.mockResolvedValueOnce({ data: envelope() });
    await fetchDashboard();
    expect(get).toHaveBeenCalledWith('/attendance/dashboard', undefined);
  });

  it('GETs the bare route also when officeId is undefined explicitly', async () => {
    get.mockResolvedValueOnce({ data: envelope() });
    await fetchDashboard(undefined);
    expect(get).toHaveBeenCalledWith('/attendance/dashboard', undefined);
  });

  it('passes the RAW officeId param — apiClient encodes the emitted URL exactly once', async () => {
    // The service must NOT pre-encode: apiClient's paramsSerializer
    // percent-encodes params itself, so an encodeURIComponent here would
    // double the escapes on the wire. Pin the raw value reaching
    // apiClient; the client's own suite pins the one encode to the URL.
    get.mockResolvedValueOnce({ data: envelope() });
    await fetchDashboard('o 1/a');
    expect(get).toHaveBeenCalledWith('/attendance/dashboard', {
      params: { officeId: 'o 1/a' },
    });
  });
});

describe('fetchDashboard (happy path)', () => {
  it('passes the five counts through as numbers', async () => {
    get.mockResolvedValueOnce({ data: envelope() });
    const res = await fetchDashboard();
    expect(res.counts).toEqual({
      tracked: 3,
      checkedIn: 2,
      notCheckedIn: 1,
      late: 0,
      onLeave: 1,
    });
    expect(res.date).toBe('2026-09-30');
    expect(res.flags).toEqual({ checkoutMissing: [], fakeLocationAttempt: [] });
    // Absent `offices` = an older deployed BE — "no stats", not a failure.
    expect(res.offices).toBeNull();
  });

  it('keeps the flags rows in WIRE order (the FE never re-sorts — the strip is the queue)', async () => {
    const older = flagRow({ employeeId: 'e1', employeeName: 'Zed', workDate: '2026-09-12' });
    const newer = flagRow({ employeeId: 'e2', employeeName: 'Arya', workDate: '2026-09-14' });
    // Deliberately NOT name-ordered — the BE's sort (workDate asc, then
    // name) is authoritative; whatever arrives is preserved.
    get.mockResolvedValueOnce({
      data: envelope({ flags: { checkoutMissing: [newer, older], fakeLocationAttempt: [] } }),
    });
    const res = await fetchDashboard();
    expect(res.flags.checkoutMissing.map(r => r.workDate)).toEqual([
      '2026-09-14',
      '2026-09-12',
    ]);
  });

  it('normalizes `offices` rows to id/name/tracked/checkedIn only (untrusted extras stripped)', async () => {
    get.mockResolvedValueOnce({
      data: envelope({
        offices: [
          officeRow({
            // An extra field the UI must never see as its own fact…
            totalEmployees: 42,
            // …and a non-string-typed field a naive passthrough would hand
            // to a Text node.
            notes: null,
          }),
        ],
      }),
    });
    const res = await fetchDashboard();
    expect(res.offices).toEqual([{ id: 'o1', name: 'Hero wala', tracked: 3, checkedIn: 2 }]);
  });

  it('zeroes offices are legitimate data, not absence', async () => {
    get.mockResolvedValueOnce({
      data: envelope({ offices: [officeRow({ tracked: 0, checkedIn: 0 })] }),
    });
    const res = await fetchDashboard();
    // An untracked office registered today is real — it must reach the
    // picker (with zeros), never be dropped or turned into null.
    expect(res.offices).toEqual([{ id: 'o1', name: 'Hero wala', tracked: 0, checkedIn: 0 }]);
  });
});

describe('normalizeDashboard — fail-closed envelope', () => {
  const cases: Array<[string, unknown]> = [
    ['the response is not an object', null],
    ['the response is an array', []],
    ['the date echo is missing', envelope({ date: undefined })],
    ['the date echo is not ISO', envelope({ date: '2026-9-30' })],
    ['the date echo is not a string', envelope({ date: 20260930 })],
    ['counts is missing', envelope({ counts: undefined })],
    ['counts is not an object', envelope({ counts: 'three' })],
    ['a count is missing', envelope({ counts: { tracked: 1, checkedIn: 0, notCheckedIn: 0, late: 0 } })],
    ['a count is a string', envelope({ counts: { tracked: '3', checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 } })],
    ['a count is negative', envelope({ counts: { tracked: -1, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 } })],
    ['a count is fractional', envelope({ counts: { tracked: 1.5, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 } })],
    ['flags is missing', envelope({ flags: undefined })],
    ['flags is not an object', envelope({ flags: [] })],
    ['flags.checkoutMissing is not a list', envelope({ flags: { checkoutMissing: {}, fakeLocationAttempt: [] } })],
    ['flags.fakeLocationAttempt is not a list', envelope({ flags: { checkoutMissing: [], fakeLocationAttempt: 'none' } })],
    ['a flags row is not an object', envelope({ flags: { checkoutMissing: ['Arya'], fakeLocationAttempt: [] } })],
    ['a flags row is missing its employeeId', envelope({ flags: { checkoutMissing: [flagRow({ employeeId: undefined })], fakeLocationAttempt: [] } })],
    ['a flags row has an empty employeeName', envelope({ flags: { checkoutMissing: [flagRow({ employeeName: '' })], fakeLocationAttempt: [] } })],
    ['a flags row has a malformed workDate', envelope({ flags: { checkoutMissing: [flagRow({ workDate: '14/09/2026' })], fakeLocationAttempt: [] } })],
    ['a flags row carries a malformed officeName (empty string)', envelope({ flags: { checkoutMissing: [flagRow({ officeName: '' })], fakeLocationAttempt: [] } })],
    ['a flags row carries a non-string officeName', envelope({ flags: { checkoutMissing: [flagRow({ officeName: 42 })], fakeLocationAttempt: [] } })],
    ['a fake-location row is missing its attemptCount', envelope({ flags: { checkoutMissing: [], fakeLocationAttempt: [flagRow()] } })],
    ['a fake-location row has a negative attemptCount', envelope({ flags: { checkoutMissing: [], fakeLocationAttempt: [flagRow({ attemptCount: -1 })] } })],
    ['a fake-location row has a fractional attemptCount', envelope({ flags: { checkoutMissing: [], fakeLocationAttempt: [flagRow({ attemptCount: 2.5 })] } })],
    ['a fake-location row has a string attemptCount', envelope({ flags: { checkoutMissing: [], fakeLocationAttempt: [flagRow({ attemptCount: '3' })] } })],
  ];

  for (const [name, bad] of cases) {
    it(`throws on ${name} — never a partially-trusted summary`, async () => {
      get.mockResolvedValueOnce({ data: bad });
      await expect(fetchDashboard()).rejects.toThrow('dashboard:');
      // The whole fetch failed — nothing was rendered from it.
      expect(get).toHaveBeenCalledTimes(1);
    });
  }

  it('keeps a fake-location row VALID and attemptCount-attached as-is', async () => {
    const row = flagRow({ attemptCount: 3 });
    const res = normalizeDashboard(envelope({
      flags: { checkoutMissing: [], fakeLocationAttempt: [row] },
    }));
    expect(res.flags.fakeLocationAttempt).toEqual([
      {
        employeeId: 'e1',
        employeeName: 'Arya',
        workDate: '2026-09-14',
        officeName: 'Hero wala',
        attemptCount: 3,
      },
    ]);
  });
});

describe('normalizeOffices — optional but fail-closed when present', () => {
  it('returns rows for a valid offices array', () => {
    const res = normalizeDashboard(envelope({ offices: [officeRow(), officeRow({ id: 'o2', name: 'Yuka', tracked: 0, checkedIn: 0 })] }));
    expect(res.offices).toHaveLength(2);
    expect(res.offices![1]).toEqual({ id: 'o2', name: 'Yuka', tracked: 0, checkedIn: 0 });
  });

  const badOffices: Array<[string, unknown]> = [
    ['a non-list offices', 'offices'],
    ['a null offices field (malformed presence, not absence)', null],
    ['an offices row that is not an object', [officeRow(), 'Yuka']],
    ['an offices row missing its id', [officeRow({ id: undefined })]],
    ['an offices row missing its name', [officeRow({ name: undefined })]],
    ['an offices row with a negative tracked', [officeRow({ tracked: -1 })]],
    ['an offices row with a string checkedIn', [officeRow({ checkedIn: '2' })]],
    ['an offices row with a fractional checkedIn', [officeRow({ checkedIn: 1.5 })]],
  ];

  for (const [name, offices] of badOffices) {
    it(`throws the whole fetch on ${name}`, () => {
      expect(() => normalizeDashboard(envelope({ offices }))).toThrow('dashboard:');
    });
  }

  it('treats a full offices list as present even when every count is a zero', () => {
    const res = normalizeDashboard(envelope({
      offices: [officeRow({ tracked: 0, checkedIn: 0 }), officeRow({ id: 'o2', name: 'Yuka', tracked: 0, checkedIn: 0 })],
    }));
    expect(res.offices).not.toBeNull();
    expect(res.offices).toHaveLength(2);
  });
});

describe('null officeName (the removed office case)', () => {
  it('passes through as null — display-only, the row still renders', () => {
    const res = normalizeDashboard(envelope({
      flags: { checkoutMissing: [flagRow({ officeName: null })], fakeLocationAttempt: [] },
    }));
    expect(res.flags.checkoutMissing[0].officeName).toBeNull();
    // …and flagRowDetail (dashboardModel) renders it without an office
    // caption — pinned in dashboardModel.test.
  });
});
