/**
 * The reset registry against the REAL stores (story 5.3, AC 5/AC 6).
 *
 * `src/services/resetRegistry.test.ts` covers the registry mechanics with
 * bare stubs; this file covers the other half — that every app store has
 * actually JOINED the registry. If a store's `registerReset(...)` line is
 * dropped (or its reset becomes a no-op), this test fails, so "a fresh login
 * never sees the previous session's data" can't silently break for one store
 * while every other suite stays green.
 *
 * `../src/services` is mocked at the barrel so the store loaders resolve
 * with fixtures instead of touching the network. That can't sever the
 * registrations: the stores import `registerReset` from the leaf
 * `services/resetRegistry` file directly, so they join the real registry
 * this file imports.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobService: { list: jest.fn() },
  customerService: { listAll: jest.fn(), create: jest.fn() },
  usersApi: { getMe: jest.fn() },
  skillService: { list: jest.fn(), create: jest.fn(), remove: jest.fn() },
  technicianService: { invite: jest.fn() },
  notificationService: {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}));

import { runAllResets } from '../src/services/resetRegistry';
import { loadJobs, useJobs } from '../src/features/jobs/useJobs';
import { loadCustomers, useCustomers } from '../src/features/customers/useCustomers';
import { loadMyProfile, useMyProfile } from '../src/features/profile/useMyProfile';
import { useTechnicians } from '../src/features/technicians/useTechnicians';
import { loadSkills, useSkills } from '../src/features/skills/useSkills';
import { loadToday, useTechnicianJobs } from '../src/features/technicianApp/useTechnicianJobs';
import { loadNotifications, useNotifications } from '../src/features/notifications/useNotifications';
import { customerService, jobService, skillService, notificationService, usersApi } from '../src/services';
import type { ApiCustomer, ApiNotification, MyProfile, Skill } from '../src/services';
import type { Technician } from '../src/features/technicians/types';

const makeCustomer = (overrides: Partial<ApiCustomer> = {}): ApiCustomer => ({
  id: 'c-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000002',
  address: null,
  city: null,
  jobCount: 0,
  lastJobDate: null,
  ...overrides,
});

const makeProfile = (overrides: Partial<MyProfile> = {}): MyProfile => ({
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
    serviceCategories: [],
    upiVpa: null,
  },
  technicians: [],
  technicianCount: 1,
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
  ...overrides,
});

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'sk-1',
  name: 'Drilling',
  tenantId: 't-1',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeTechnician = (overrides: Partial<Technician> = {}): Technician => ({
  id: 'invite_i-1',
  name: 'Anbu',
  phone: '9000000001',
  status: 'offline',
  invitedAt: '2026-01-01T00:00:00Z',
  skillIds: ['sk-1'],
  ...overrides,
});

const makeNotification = (overrides: Partial<ApiNotification> = {}): ApiNotification => ({
  id: 'n-1',
  jobId: 'job-1',
  eventType: 'on_my_way',
  payload: { job_number: 'JB-2026-0042', step: 'on_my_way', technician_name: 'Priya' },
  readAt: null,
  createdAt: '2026-09-09T09:00:00Z',
  ...overrides,
});

// One probe subscribed to all seven stores, exactly as the app's screens are.
let probe: {
  jobs: ReturnType<typeof useJobs>;
  customers: ReturnType<typeof useCustomers>;
  profile: ReturnType<typeof useMyProfile>;
  technicians: ReturnType<typeof useTechnicians>;
  skills: ReturnType<typeof useSkills>;
  techJobs: ReturnType<typeof useTechnicianJobs>;
  notifications: ReturnType<typeof useNotifications>;
} | null = null;

function Probe(): null {
  probe = {
    jobs: useJobs(),
    customers: useCustomers(),
    profile: useMyProfile(),
    technicians: useTechnicians(),
    skills: useSkills(),
    techJobs: useTechnicianJobs(),
    notifications: useNotifications(),
  };
  return null;
}

it('resets every app store to its pre-login state (AC 5, AC 6)', async () => {
  (jobService.list as jest.Mock).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
  (customerService.listAll as jest.Mock).mockResolvedValue([makeCustomer()]);
  (usersApi.getMe as jest.Mock).mockResolvedValue(makeProfile());
  (skillService.list as jest.Mock).mockResolvedValue([makeSkill()]);
  (notificationService.list as jest.Mock).mockResolvedValue({
    data: [makeNotification()],
    nextCursor: null,
    hasMore: false,
  });
  (notificationService.unreadCount as jest.Mock).mockResolvedValue({ unreadCount: 2 });

  await act(async () => {
    create(<Probe />);
  });
  // Mount effects auto-load customers/profile/skills/jobs; the explicit
  // unforced calls join those in-flight requests and await their settle.
  // `loadToday` has no mount effect (screens own the technician fetch
  // schedule), so it starts the request itself. The notifications store's
  // mount effect loads the badge only — the list is an explicit call, and
  // its loader is NOT throttled on a cold store.
  await act(async () => {
    await Promise.all([
      loadJobs(),
      loadCustomers(),
      loadMyProfile(),
      loadSkills(),
      loadToday(),
      loadNotifications(),
    ]);
  });
  await act(async () => {
    probe?.technicians.refresh([makeTechnician()]);
  });

  // Every store holds post-login data.
  expect(probe?.jobs.hasLoaded).toBe(true);
  expect(probe?.customers.customers).toHaveLength(1);
  expect(probe?.profile.profile).not.toBeNull();
  expect(probe?.technicians.technicians).toHaveLength(1);
  expect(probe?.skills.skills).toHaveLength(1);
  expect(probe?.techJobs.hasLoadedToday).toBe(true);
  expect(probe?.notifications.items).toHaveLength(1);
  expect(probe?.notifications.unreadCount).toBe(2);

  // The clear flips every `hasLoaded`/data flag, so the probe's auto-load
  // effects refire and refetch — on a real logout the gate unmounts the
  // screens before any refetch lands. Hang the loaders so those refires
  // never settle: the reset snapshot below stays exact and nothing updates
  // outside act.
  (jobService.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
  (customerService.listAll as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  );
  (usersApi.getMe as jest.Mock).mockImplementation(() => new Promise(() => {}));
  (skillService.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
  (notificationService.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
  (notificationService.unreadCount as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  );

  act(() => {
    runAllResets();
  });

  // All seven back to pre-login — no store left holding the session's data.
  expect(probe?.jobs).toMatchObject({ jobs: [], hasLoaded: false });
  expect(probe?.customers).toMatchObject({ customers: [], hasLoaded: false });
  expect(probe?.profile.profile).toBeNull();
  expect(probe?.technicians.technicians).toEqual([]);
  expect(probe?.skills).toMatchObject({ skills: [], hasLoaded: false });
  expect(probe?.techJobs).toMatchObject({
    today: [],
    history: [],
    hasLoadedToday: false,
    hasLoadedHistory: false,
  });
  expect(probe?.notifications).toMatchObject({
    items: [],
    hasLoaded: false,
    unreadCount: null,
  });
});