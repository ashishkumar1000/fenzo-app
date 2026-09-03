/**
 * `jobService.list`'s query building — the wire half of the status-filter
 * contract (AC 2). The store tests mock the whole services module, so this
 * is the only place the real `list()` executes: `apiClient` is mocked and
 * we assert the exact `params` axios will send.
 */
jest.mock('../src/services/api/apiClient', () => ({
  apiClient: { get: jest.fn() },
}));

import { jobService } from '../src/services/resources/jobs';
import { apiClient } from '../src/services/api/apiClient';

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { data: [], nextCursor: null, hasMore: false } });
});

it('sends no params for the default (all) query', async () => {
  await jobService.list();
  expect(get).toHaveBeenCalledWith('/jobs', { params: {} });
});

it('sends the status array for a filtered query', async () => {
  await jobService.list({ status: ['scheduled', 'in_progress'] });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: { status: ['scheduled', 'in_progress'] },
  });
});

it('drops an empty status array rather than sending an empty param', async () => {
  await jobService.list({ status: [] });
  expect(get).toHaveBeenCalledWith('/jobs', { params: {} });
});

it('passes cursor, date, technicianId and limit through untouched', async () => {
  await jobService.list({
    date: '2026-09-03',
    technicianId: 'tech-1',
    cursor: 'cursor-1',
    limit: 10,
  });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: {
      date: '2026-09-03',
      technicianId: 'tech-1',
      cursor: 'cursor-1',
      limit: 10,
    },
  });
});

it('getById hits /jobs/:id and forwards the abort signal', async () => {
  const controller = new AbortController();
  await jobService.getById('j-1', controller.signal);
  expect(get).toHaveBeenCalledWith('/jobs/j-1', { signal: controller.signal });
});

it('getById works without a signal (no abort requested)', async () => {
  await jobService.getById('j-1');
  expect(get).toHaveBeenCalledWith('/jobs/j-1', { signal: undefined });
});