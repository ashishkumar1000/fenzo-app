/**
 * The `/users/me` resource wrappers: `apiClient` is mocked so the tests pin
 * the wire contract — method, path, body, and the `res.data` unwrap — with
 * no network. Mirrors the boundary `jobs.test.ts` uses for its wrappers.
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from '../api/apiClient';
import { usersApi } from './users';
import type { MyProfile } from './users';

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

/** A completed-setup owner profile, exactly the shape `/users/me` returns. */
const PROFILE: MyProfile = {
  id: 'u-1',
  name: 'Kumar Selvan',
  countryCode: '+91',
  phoneNumber: '9000000000',
  status: 'active',
  role: 'owner',
  tenant: {
    id: 't-1',
    companyName: 'Fenzit Services',
    gstin: null,
    address: null,
    stateCode: 'TN',
    upiVpa: null,
  },
  technicians: [],
  technicianCount: 2,
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
};

describe('usersApi.getMe', () => {
  it('GETs /users/me and returns the payload untouched', async () => {
    get.mockResolvedValueOnce({ data: PROFILE });
    const returned = await usersApi.getMe();
    expect(returned).toBe(PROFILE);
    expect(get).toHaveBeenCalledWith('/users/me', { signal: undefined, params: {} });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('sends jobsScope=today when requested (Story 1.7)', async () => {
    get.mockResolvedValueOnce({ data: PROFILE });
    await usersApi.getMe(undefined, 'today');
    expect(get).toHaveBeenCalledWith('/users/me', {
      signal: undefined,
      params: { jobsScope: 'today' },
    });
  });

  it('omits jobsScope from params when explicitly "all"-less callers pass none', async () => {
    const signal = new AbortController().signal;
    get.mockResolvedValueOnce({ data: PROFILE });
    await usersApi.getMe(signal);
    expect(get).toHaveBeenCalledWith('/users/me', { signal, params: {} });
  });
});

describe('usersApi.updateMe (story 5.2)', () => {
  it('PATCHes /users/me with the name body and returns the full profile payload', async () => {
    const patched = { ...PROFILE, name: 'Kumar S' };
    patch.mockResolvedValueOnce({ data: patched });
    const returned = await usersApi.updateMe({ name: 'Kumar S' });
    expect(returned).toBe(patched);
    expect(patch).toHaveBeenCalledWith('/users/me', { name: 'Kumar S' });
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
