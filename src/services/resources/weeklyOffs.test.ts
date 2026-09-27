/**
 * Tests for `weeklyOffsService` (Story 15-6, contract pin): the URL
 * shapes and request bodies match the BE contract documented in
 * `fenzit-be/docs/api-contracts.md` → "Weekly offs". These tests catch
 * accidental route changes; the BE owns the source of truth, so any
 * drift here means either the FE was wrong or the BE moved and the
 * contract doc wasn't updated.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { weeklyOffsService } from './weeklyOffs';

const client = apiClient as unknown as {
  get: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
};

beforeEach(() => {
  jest.resetAllMocks();
});

function view(days: number[], validFrom: string, validTo: string | null = null) {
  return { days, validFrom, validTo };
}

describe('weeklyOffsService.getDefault', () => {
  it('GETs /attendance/weekly-offs and returns the body', async () => {
    const body = {
      default: view([7], '2026-09-27'),
      next: null,
      history: [view([7], '2026-09-27')],
    };
    client.get.mockResolvedValueOnce({ data: body });
    const out = await weeklyOffsService.getDefault();
    expect(client.get).toHaveBeenCalledWith('/attendance/weekly-offs');
    expect(out).toEqual(body);
  });

  it('defends against a malformed body (history not an array)', async () => {
    client.get.mockResolvedValueOnce({ data: { default: null, next: null, history: 'oops' } });
    const out = await weeklyOffsService.getDefault();
    expect(out.history).toEqual([]);
  });
});

describe('weeklyOffsService.setDefault', () => {
  it('PUTs the body to /attendance/weekly-offs', async () => {
    const body = { default: view([1, 7], '2026-09-27'), next: null, history: [] };
    client.put.mockResolvedValueOnce({ data: body });
    const out = await weeklyOffsService.setDefault({
      days: [1, 7],
      effectiveFrom: '2026-09-27',
    });
    expect(client.put).toHaveBeenCalledWith(
      '/attendance/weekly-offs',
      { days: [1, 7], effectiveFrom: '2026-09-27' },
    );
    expect(out).toEqual(body);
  });
});

describe('weeklyOffsService.listOverrides', () => {
  it('GETs /attendance/weekly-offs/overrides', async () => {
    const rows = [{
      employeeId: 'e1',
      employeeName: 'A',
      current: view([5], '2026-09-27'),
      next: null,
    }];
    client.get.mockResolvedValueOnce({ data: rows });
    const out = await weeklyOffsService.listOverrides();
    expect(client.get).toHaveBeenCalledWith('/attendance/weekly-offs/overrides');
    expect(out).toEqual(rows);
  });

  it('defends against a non-array body', async () => {
    client.get.mockResolvedValueOnce({ data: { wrong: true } });
    const out = await weeklyOffsService.listOverrides();
    expect(out).toEqual([]);
  });
});

describe('weeklyOffsService.setOverride', () => {
  it('PUTs the body to /attendance/weekly-offs/overrides/:employeeId', async () => {
    const row = {
      employeeId: 'e1',
      employeeName: 'A',
      current: view([5], '2026-09-27'),
      next: null,
    };
    client.put.mockResolvedValueOnce({ data: row });
    const out = await weeklyOffsService.setOverride('e1', { days: [5] });
    expect(client.put).toHaveBeenCalledWith(
      '/attendance/weekly-offs/overrides/e1',
      { days: [5] },
    );
    expect(out).toEqual(row);
  });

  it('URI-encodes the employeeId (defensive against ids with slashes/spaces)', async () => {
    client.put.mockResolvedValueOnce({ data: {} });
    await weeklyOffsService.setOverride('a/b c', { days: [] });
    expect(client.put).toHaveBeenCalledWith(
      '/attendance/weekly-offs/overrides/a%2Fb%20c',
      { days: [] },
    );
  });
});

describe('weeklyOffsService.removeOverride', () => {
  it('DELETEs /attendance/weekly-offs/overrides/:employeeId without query params when no effectiveFrom', async () => {
    client.delete.mockResolvedValueOnce({ data: {} });
    await weeklyOffsService.removeOverride('e1');
    expect(client.delete).toHaveBeenCalledWith(
      '/attendance/weekly-offs/overrides/e1',
      { params: undefined },
    );
  });

  it('passes effectiveFrom as a query param when supplied', async () => {
    client.delete.mockResolvedValueOnce({ data: {} });
    await weeklyOffsService.removeOverride('e1', '2026-10-15');
    expect(client.delete).toHaveBeenCalledWith(
      '/attendance/weekly-offs/overrides/e1',
      { params: { effectiveFrom: '2026-10-15' } },
    );
  });
});
