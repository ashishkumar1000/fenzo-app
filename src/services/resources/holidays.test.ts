/**
 * Tests for `holidaysService` (Story 15-6, contract pin): the URL shapes
 * and request bodies match the BE contract documented in
 * `fenzit-be/docs/api-contracts.md` → "Holidays". The service has a thin
 * surface — every public method is pinned here.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { holidaysService } from './holidays';

const client = apiClient as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

beforeEach(() => {
  jest.resetAllMocks();
});

function holiday(id: string, date: string, name: string) {
  return { id, date, name };
}

describe('holidaysService.list', () => {
  it('GETs /attendance/holidays and returns the body', async () => {
    client.get.mockResolvedValueOnce({ data: [holiday('h1', '2026-10-02', 'X')] });
    const out = await holidaysService.list();
    expect(client.get).toHaveBeenCalledWith('/attendance/holidays');
    expect(out).toEqual([holiday('h1', '2026-10-02', 'X')]);
  });

  it('defends against a non-array body', async () => {
    client.get.mockResolvedValueOnce({ data: { wrong: true } });
    const out = await holidaysService.list();
    expect(out).toEqual([]);
  });
});

describe('holidaysService.create', () => {
  it('POSTs the body to /attendance/holidays', async () => {
    client.post.mockResolvedValueOnce({ data: holiday('h1', '2026-10-02', 'X') });
    await holidaysService.create({ date: '2026-10-02', name: 'X' });
    expect(client.post).toHaveBeenCalledWith(
      '/attendance/holidays',
      { date: '2026-10-02', name: 'X' },
    );
  });
});

describe('holidaysService.update', () => {
  it('PATCHes name-only to /attendance/holidays/:id (date is immutable)', async () => {
    client.patch.mockResolvedValueOnce({ data: holiday('h1', '2026-10-02', 'Y') });
    await holidaysService.update('h1', { name: 'Y' });
    expect(client.patch).toHaveBeenCalledWith(
      '/attendance/holidays/h1',
      { name: 'Y' },
    );
  });

  it('URI-encodes the id', async () => {
    client.patch.mockResolvedValueOnce({ data: {} });
    await holidaysService.update('a/b', { name: 'Y' });
    expect(client.patch).toHaveBeenCalledWith(
      '/attendance/holidays/a%2Fb',
      { name: 'Y' },
    );
  });
});

describe('holidaysService.remove', () => {
  it('DELETEs /attendance/holidays/:id and returns void on 204', async () => {
    client.delete.mockResolvedValueOnce({ status: 204, data: null });
    await expect(holidaysService.remove('h1')).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledWith('/attendance/holidays/h1');
  });
});

describe('holidaysService.impact', () => {
  it('GETs /attendance/holidays/impact?date=', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        date: '2026-10-02',
        affectedEmployees: [{ employeeId: 'e1', employeeName: 'A' }],
      },
    });
    const out = await holidaysService.impact('2026-10-02');
    expect(client.get).toHaveBeenCalledWith(
      '/attendance/holidays/impact',
      { params: { date: '2026-10-02' } },
    );
    expect(out).toEqual({
      date: '2026-10-02',
      affectedEmployees: [{ employeeId: 'e1', employeeName: 'A' }],
    });
  });

  it('defends against missing fields', async () => {
    client.get.mockResolvedValueOnce({ data: { wrong: true } });
    const out = await holidaysService.impact('2026-10-02');
    expect(out.date).toBe('2026-10-02'); // falls back to the request date
    expect(out.affectedEmployees).toEqual([]);
  });
});
