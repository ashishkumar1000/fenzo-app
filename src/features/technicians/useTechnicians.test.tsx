/**
 * Tests for the `useTechnicians` store contract around `add` (the only
 * network-backed action): a successful invite commits the technician at the
 * top of the list and persists it to MMKV, and an invite that resolves AFTER
 * a session reset (a concurrent request's 401 → `runAllResets` →
 * `clearTechnicians`) must NOT repopulate the just-cleared store — the
 * previous session's technician would otherwise leak into memory and disk
 * (see services/resetRegistry.ts's epoch counter).
 *
 * The store is probed through a tiny component (same pattern as
 * `useAuth.test.tsx`) because `add` is returned from the hook rather than
 * exported standalone.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { technicianService } from '../../services';
import { storage } from '../../services/storage';
import { runAllResets } from '../../services/resetRegistry';
import { DIAL_CODE } from './constants';
import { clearTechnicians, useTechnicians } from './useTechnicians';
import type { NewTechnicianInput, Technician } from './types';

const invite = jest.spyOn(technicianService, 'invite');

/** Same key `useTechnicians.ts` persists under — kept in sync here. */
const MMKV_KEY = 'fenzit.technicians';

const INPUT: NewTechnicianInput = {
  name: 'Suresh Rao',
  phone: '9876500000',
  skillIds: ['skill-1'],
};

// Captured by the probe on every render — the hook's `add` (stable
// useCallback) and the current store list.
let addFn: (input: NewTechnicianInput) => Promise<Technician>;
let list: Technician[];

function Probe() {
  const technicians = useTechnicians();
  addFn = technicians.add;
  list = technicians.technicians;
  return null;
}

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

function mountProbe() {
  act(() => {
    renderer = create(<Probe />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  invite.mockResolvedValue({ inviteId: 'inv-1' });
  clearTechnicians(); // module state persists across tests in this file
  mountProbe();
});

afterEach(() => {
  renderer?.unmount();
  renderer = null;
});

function persisted(): Technician[] {
  const raw = storage.getString(MMKV_KEY);
  return raw ? (JSON.parse(raw) as Technician[]) : [];
}

it('commits the invited technician to the top of the list and persists it', async () => {
  await act(async () => {
    await addFn(INPUT);
  });

  expect(invite).toHaveBeenCalledWith({
    countryCode: DIAL_CODE,
    phoneNumber: '9876500000',
    name: 'Suresh Rao',
    skillIds: ['skill-1'],
  });
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({
    id: 'invite_inv-1',
    name: 'Suresh Rao',
    phone: '9876500000',
    status: 'offline',
  });
  expect(persisted()).toEqual(list);
});

it('does not repopulate the cleared store when the session resets mid-invite', async () => {
  let resolveInvite!: (response: { inviteId: string }) => void;
  invite.mockReturnValueOnce(
    new Promise(resolve => {
      resolveInvite = resolve;
    }),
  );

  // The epoch is captured synchronously at the call, before the first await.
  const pending = addFn(INPUT);

  // A concurrent request's 401 fires the global reset while the invite is
  // still in flight — the store (and its MMKV copy) is wiped.
  runAllResets();
  expect(list).toEqual([]);

  await act(async () => {
    resolveInvite({ inviteId: 'inv-9' });
  });
  const returned = await pending;

  // The invite did succeed server-side, so the caller still gets a valid
  // technician — only the local write is skipped.
  expect(returned.id).toBe('invite_inv-9');
  expect(list).toEqual([]);
  expect(persisted()).toEqual([]);
});