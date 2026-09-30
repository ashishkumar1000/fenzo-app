/**
 * Tests for the corrections history service (Story 18-3, spec §3 test
 * plan): the owner vs me route split (cursors are endpoint-scoped on the
 * wire — the FE never crosses them); params (workDate/cursor/limit; no
 * limit param → the BE default 20 applies); the house Paginated envelope
 * passthrough; the D6 value formatter (status word → DESIGN.md label;
 * instants → "Times 9:02 AM – 6:00 PM"; empty → "—"); and the documented
 * error mapping (400 'Invalid cursor' / 422 employeeId / 403 me-none)
 * surfacing as the SAME rejection — the FE adds no recovery policy.
 *
 * Story 18-4 adds the WRITE (`correctDay`): the PUT route with both path
 * params encodeURIComponent'd, the XOR body sent VERBATIM (no reshaping,
 * no idempotency key — a replay IS a legitimate re-correction), and the
 * 200 echo returned as-is (the raw override — the FE never seeds cells
 * from it, it refreshes).
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import {
  correctDay,
  fetchCorrections,
  formatCorrectionValue,
  type CorrectionEntry,
} from './attendanceCorrections';

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

function entry(overrides: Partial<CorrectionEntry> = {}): CorrectionEntry {
  return {
    id: 'c1',
    employeeId: 'e1',
    workDate: '2026-09-14',
    correctedAt: '2026-09-15T09:00:00+05:30',
    actorName: 'Ayush',
    note: 'Fixed the times',
    oldValue: { status: 'absent', checkinAt: null, checkoutAt: null },
    newValue: {
      status: null,
      checkinAt: '2026-09-14T10:22:00+05:30',
      checkoutAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('fetchCorrections — routing + params', () => {
  it('owner: GETs /attendance/corrections with employeeId + workDate + limit', async () => {
    get.mockResolvedValueOnce({ data: { data: [entry()], nextCursor: null, hasMore: false } });

    const res = await fetchCorrections({
      employeeId: 'e1',
      workDate: '2026-09-14',
      limit: 50,
    });

    expect(get).toHaveBeenCalledWith('/attendance/corrections', {
      params: { employeeId: 'e1', workDate: '2026-09-14', limit: 50 },
    });
    expect(res).toEqual({ data: [entry()], nextCursor: null, hasMore: false });
  });

  it('me: GETs /attendance/me/corrections — no employeeId param ever', async () => {
    get.mockResolvedValueOnce({ data: { data: [], nextCursor: null, hasMore: false } });

    await fetchCorrections({ me: true, workDate: '2026-09-14' });

    expect(get).toHaveBeenCalledWith('/attendance/me/corrections', {
      params: { workDate: '2026-09-14' },
    });
  });

  it('passes a cursor through (the sheet’s "Show earlier") and omits an absent limit', async () => {
    get.mockResolvedValueOnce({ data: { data: [], nextCursor: 'n1', hasMore: true } });

    const res = await fetchCorrections({ employeeId: 'e1', cursor: 'c0' });

    expect(get).toHaveBeenCalledWith('/attendance/corrections', {
      params: { employeeId: 'e1', cursor: 'c0' },
    });
    expect(res.nextCursor).toBe('n1');
    expect(res.hasMore).toBe(true);
  });

  it.each([
    [
      'a foreign-scope/malformed cursor',
      { employeeId: 'e1', cursor: 'bogus' },
      { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid cursor' },
    ],
    [
      'a missing/malformed employeeId',
      {},
      { status: 422, code: 'VALIDATION_ERROR', message: 'employeeId must be a UUID' },
    ],
    [
      'me with access state none',
      { me: true },
      { status: 403, code: 'ATTENDANCE_NOT_TRACKED', message: 'Attendance is not enabled' },
    ],
  ])('%s surfaces the documented ApiError verbatim (no FE mapping)', async (_name, query, error) => {
    get.mockRejectedValueOnce(error);

    // The deliberate NON-house 400 on a bad cursor is pinned so callers
    // branch on the code; the service adds no retry/recovery policy.
    await expect(fetchCorrections(query)).rejects.toEqual(error);
  });
});

describe('formatCorrectionValue — the D6 formatter', () => {
  it('a status word renders its DESIGN.md label', () => {
    expect(formatCorrectionValue({ status: 'absent', checkinAt: null, checkoutAt: null })).toBe(
      'Absent',
    );
    expect(formatCorrectionValue({ status: 'in_progress', checkinAt: null, checkoutAt: null })).toBe(
      'In progress',
    );
  });

  it('instants render "Times 9:02 AM – 6:00 PM" (wall-clock, 12-hour, en dash)', () => {
    expect(
      formatCorrectionValue({
        status: null,
        checkinAt: '2026-09-14T09:02:00+05:30',
        checkoutAt: '2026-09-14T18:00:00+05:30',
      }),
    ).toBe('Times 9:02 AM – 6:00 PM');
  });

  it('a lone check-in still renders the Times prefix with its one time', () => {
    expect(
      formatCorrectionValue({
        status: null,
        checkinAt: '2026-09-14T09:02:00+05:30',
        checkoutAt: null,
      }),
    ).toBe('Times 9:02 AM');
  });

  it('an unparseable instant is skipped, not rendered as null', () => {
    expect(
      formatCorrectionValue({
        status: null,
        checkinAt: 'garbage',
        checkoutAt: '2026-09-14T18:00:00+05:30',
      }),
    ).toBe('Times 6:00 PM');
  });

  it('an empty value renders "—"', () => {
    expect(formatCorrectionValue({ status: null, checkinAt: null, checkoutAt: null })).toBe('—');
  });
});

describe('correctDay — the 18-4 write', () => {
  const echo = {
    workDate: '2026-09-14',
    override: { status: 'present', checkinAt: null, checkoutAt: null },
    correctedAt: '2026-09-29T10:00:00+05:30',
    actorId: 'actor-1',
  };

  it('PUTs /attendance/corrections/:employeeId/:workDate and returns the echo', async () => {
    put.mockResolvedValueOnce({ data: echo });

    const body = { status: 'present' as const, note: 'No attendance exists' };
    const res = await correctDay('e1', '2026-09-14', body);

    expect(put).toHaveBeenCalledWith('/attendance/corrections/e1/2026-09-14', body);
    expect(res).toEqual(echo);
  });

  it('encodes both path params (the placeholder UUID / odd ids never reshape the route)', async () => {
    put.mockResolvedValueOnce({ data: echo });

    await correctDay('a/b?c', '2026-09-14', { status: 'absent', note: 'n' });

    expect(put).toHaveBeenCalledWith(
      '/attendance/corrections/a%2Fb%3Fc/2026-09-14',
      { status: 'absent', note: 'n' },
    );
  });

  it('sends the instants arm VERBATIM — no reshaping, no idempotency key', async () => {
    put.mockResolvedValueOnce({ data: echo });

    const body = {
      checkinAt: '2026-09-14T09:00:00+05:30',
      checkoutAt: '2026-09-14T18:00:00+05:30',
      note: 'Fixed the times',
    };
    await correctDay('e1', '2026-09-14', body);

    expect(put).toHaveBeenCalledWith('/attendance/corrections/e1/2026-09-14', body);
  });

  it('the wire 422s surface as ApiError verbatim (no FE mapping)', async () => {
    const error = {
      status: 422,
      code: 'ATTENDANCE_FUTURE_DATE',
      message: 'The day is in the future.',
    };
    put.mockRejectedValueOnce(error);

    await expect(
      correctDay('e1', '2026-09-30', { status: 'present', note: 'n' }),
    ).rejects.toEqual(error);
  });
});
