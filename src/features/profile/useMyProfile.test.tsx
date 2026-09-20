/**
 * Tests for the profile store's side-band into the technicians store: every
 * fresh owner profile — a `GET /users/me` landing through a mounted hook, or
 * the PATCH response through `setProfileFromServer` — hydrates the technician
 * roster (see `hydrateTechnicianRoster`). This is what makes invites survive
 * a reinstall or logout: the roster rides along on the profile payload, so
 * no extra request, and the Technicians screen shows server-issued records
 * even though the technicians store's own copy is device-local MMKV.
 *
 * Technician-role profiles carry no roster (the field is owner-only on the
 * backend) and must leave the store untouched.
 *
 * Both real stores run here (only `usersApi.getMe` is spied) — the point IS
 * the hand-off between the two stores.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { usersApi } from '../../services';
import type { MyProfile, ProfileTechnician } from '../../services';
import { clearTechnicians, useTechnicians } from '../technicians/useTechnicians';
import { clearMyProfile, setProfileFromServer, useMyProfile } from './useMyProfile';

const getMe = jest.spyOn(usersApi, 'getMe');

const ROSTER: ProfileTechnician[] = [
  {
    id: 'user-1',
    name: 'Suresh Rao',
    countryCode: '+91',
    phoneNumber: '9876500000',
    status: 'active',
    skills: ['Plumbing'],
    skillIds: ['skill-1'],
    createdAt: '2026-09-18T09:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Meena Iyer',
    countryCode: '+91',
    phoneNumber: '9876511111',
    status: 'invited',
    skills: ['Wiring'],
    skillIds: ['skill-2'],
    createdAt: '2026-09-19T09:00:00Z',
  },
];

/** Minimal owner profile — only the fields this store and its hydrator read. */
const OWNER_PROFILE = {
  id: 'owner-1',
  name: null,
  countryCode: '+91',
  phoneNumber: '9999999999',
  status: 'active',
  tenant: {
    id: 'tenant-1',
    companyName: 'Acme Repairs',
    gstin: null,
    address: null,
    stateCode: 'KA',
    upiVpa: null,
  },
  role: 'owner',
  technicians: ROSTER,
  technicianCount: ROSTER.length,
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
} as unknown as MyProfile;

/** Technician-role payload: no `technicians` field at all (backend omits it). */
const TECHNICIAN_PROFILE = {
  id: 'tech-1',
  name: 'Suresh Rao',
  countryCode: '+91',
  phoneNumber: '9876500000',
  status: 'active',
  tenant: OWNER_PROFILE.tenant,
  role: 'technician',
  skills: ['Plumbing'],
  skillIds: ['skill-1'],
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
} as unknown as MyProfile;

// Captured on every render — the profile store's state and the technicians
// store's list, both live.
let profileState: ReturnType<typeof useMyProfile>;
let techList: ReturnType<typeof useTechnicians>['technicians'];

function Probe() {
  profileState = useMyProfile();
  techList = useTechnicians().technicians;
  return null;
}

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

beforeEach(() => {
  getMe.mockReset();
  getMe.mockResolvedValue(OWNER_PROFILE);
  clearTechnicians();
  clearMyProfile();
});

afterEach(() => {
  renderer?.unmount();
  renderer = null;
});

it('a fresh owner profile load hydrates the technicians store from the roster', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });

  expect(profileState.profile?.role).toBe('owner');
  expect(techList.map(t => t.id)).toEqual(['user-1', 'user-2']);
  expect(techList[1]).toMatchObject({ name: 'Meena Iyer', status: 'offline' });
});

it('a technician-role profile does not touch the technicians store', async () => {
  getMe.mockResolvedValue(TECHNICIAN_PROFILE);

  await act(async () => {
    renderer = create(<Probe />);
  });

  expect(profileState.profile?.role).toBe('technician');
  expect(techList).toEqual([]);
});

it('setProfileFromServer (the PATCH response) hydrates the roster too', async () => {
  // A getMe that never resolves keeps the GET path out of the picture —
  // only the PATCH write below may populate the store.
  getMe.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(techList).toEqual([]);

  act(() => {
    setProfileFromServer(OWNER_PROFILE);
  });

  expect(techList.map(t => t.id)).toEqual(['user-1', 'user-2']);
});
