/**
 * Tests for the offices service: the exact URL/method/params each call
 * builds (`includeArchived` only when asked for, `encodeURIComponent` on
 * every officeId across get/update/archive/archivePreview), the unwrapping
 * contracts (`list` defensively falls back to `[]` on any malformed/null
 * body, `get`/`create`/`update`/`archivePreview` return `res.data`
 * untouched, `archive` POSTs with no body and ignores the response
 * envelope), and that `create` POSTs the full payload.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { officesService } from './offices';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

function rule(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    startTime: '09:00',
    endTime: '18:00',
    lateCutoffMinutes: 15,
    fullDayHours: 8,
    halfDayHours: 4,
    validFrom: '2026-09-01',
    validTo: null,
    ...overrides,
  };
}

describe('officesService.list', () => {
  it('GETs /attendance/offices without params by default', async () => {
    get.mockResolvedValueOnce({ data: [] });

    const returned = await officesService.list();

    expect(returned).toEqual([]);
    expect(get).toHaveBeenCalledWith('/attendance/offices', { params: undefined });
  });

  it('passes includeArchived when asked', async () => {
    get.mockResolvedValueOnce({ data: [] });

    await officesService.list(true);

    expect(get).toHaveBeenCalledWith('/attendance/offices', {
      params: { includeArchived: true },
    });
  });

  it('falls back to [] when the body is missing/malformed', async () => {
    get.mockResolvedValueOnce({ data: {} });

    const returned = await officesService.list(true);

    expect(returned).toEqual([]);
  });

  it('falls back to [] when the body is null', async () => {
    get.mockResolvedValueOnce({ data: null });

    const returned = await officesService.list();

    expect(returned).toEqual([]);
  });
});

describe('officesService.get', () => {
  it('GETs the detail and returns the body untouched', async () => {
    const detail = {
      id: 'office-1',
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
      archivedAt: null,
      rules: [rule('rule-1')],
    };
    get.mockResolvedValueOnce({ data: detail });

    const returned = await officesService.get('office-1');

    expect(returned).toBe(detail);
    expect(get).toHaveBeenCalledWith('/attendance/offices/office-1');
  });

  it('percent-encodes the officeId so path-unsafe ids cannot change the route shape', async () => {
    get.mockResolvedValueOnce({ data: null });

    await officesService.get('office/with?unsafe');

    expect(get).toHaveBeenCalledWith('/attendance/offices/office%2Fwith%3Funsafe');
  });
});

describe('officesService.create', () => {
  it('POSTs the full create payload and returns the seeded office', async () => {
    const input = {
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 150,
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 10,
      fullDayHours: 8,
      halfDayHours: 4,
    };
    const created = { id: 'office-new', rule: rule('rule-seed') };
    post.mockResolvedValueOnce({ data: created });

    const returned = await officesService.create(input);

    expect(returned).toBe(created);
    expect(post).toHaveBeenCalledWith('/attendance/offices', input);
  });
});

describe('officesService.update', () => {
  it('PATCHes only the diff-gated fields and returns the refreshed detail', async () => {
    const detail = {
      id: 'office-1',
      name: 'Renamed',
      latitude: 19.2,
      longitude: 72.9,
      radiusM: 100,
      archivedAt: null,
      rules: [rule('rule-1'), rule('rule-2', { validFrom: '2026-09-27' })],
    };
    patch.mockResolvedValueOnce({ data: detail });

    const returned = await officesService.update('office-1', { name: 'Renamed' });

    expect(returned).toBe(detail);
    expect(patch).toHaveBeenCalledWith('/attendance/offices/office-1', { name: 'Renamed' });
  });

  it('percent-encodes the officeId so path-unsafe ids cannot change the route shape', async () => {
    patch.mockResolvedValueOnce({ data: null });

    await officesService.update('office/with?unsafe', { name: 'Renamed' });

    expect(patch).toHaveBeenCalledWith('/attendance/offices/office%2Fwith%3Funsafe', {
      name: 'Renamed',
    });
  });
});

describe('officesService.archive', () => {
  it('POSTs the archive route with no body and ignores the response envelope', async () => {
    // A 204 may still arrive wrapped; the service must not read it.
    post.mockResolvedValueOnce({ data: { ignored: true } });

    await expect(officesService.archive('office-1')).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledWith('/attendance/offices/office-1/archive');
  });

  it('percent-encodes the officeId so path-unsafe ids cannot change the route shape', async () => {
    post.mockResolvedValueOnce({ data: null });

    await officesService.archive('office/with?unsafe');

    expect(post).toHaveBeenCalledWith('/attendance/offices/office%2Fwith%3Funsafe/archive');
  });
});

describe('officesService.archivePreview', () => {
  it('GETs the preview route and returns the blockers payload untouched', async () => {
    const preview = {
      officeId: 'office-1',
      blockers: [{ employeeId: 'e1', employeeName: 'Kadu' }],
    };
    get.mockResolvedValueOnce({ data: preview });

    const returned = await officesService.archivePreview('office-1');

    expect(returned).toBe(preview);
    expect(get).toHaveBeenCalledWith('/attendance/offices/office-1/archive/preview');
  });

  it('percent-encodes the officeId so path-unsafe ids cannot change the route shape', async () => {
    get.mockResolvedValueOnce({ data: { officeId: 'x', blockers: [] } });

    await officesService.archivePreview('office/with?unsafe');

    expect(get).toHaveBeenCalledWith('/attendance/offices/office%2Fwith%3Funsafe/archive/preview');
  });
});

describe('officesService error contracts', () => {
  it('create propagates the 409 name-taken ApiError unchanged', async () => {
    const err = {
      status: 409,
      code: 'ATTENDANCE_OFFICE_NAME_TAKEN',
      message: 'That name is already used by another office',
      details: null,
    };
    post.mockRejectedValueOnce(err);

    await expect(
      officesService.create({
        name: 'Andheri branch',
        latitude: 19.1364,
        longitude: 72.8296,
        startTime: '09:00',
        endTime: '18:00',
      }),
    ).rejects.toBe(err);
  });

  it('archive propagates the 409 archive-blocked ApiError with details.blockers unchanged', async () => {
    // The blockers array must arrive at the TOP level of ApiError.details —
    // the form reads `err.details.blockers` for its blocking-employee count.
    const err = {
      status: 409,
      code: 'ATTENDANCE_OFFICE_ARCHIVE_BLOCKED',
      message: 'office has tracked employees assigned',
      details: { blockers: [{ employeeId: 'e1', employeeName: 'Kadu' }] },
    };
    post.mockRejectedValueOnce(err);

    await expect(officesService.archive('office-1')).rejects.toBe(err);
  });
});

