/**
 * Tests for the `useTechnicians` store contract around `add` (the only
 * network-backed action) and `hydrateTechnicianRoster` (the profile-roster
 * hydration). `add`: a successful invite commits the technician at the top
 * of the list and persists it to MMKV, and an invite that resolves AFTER a
 * session reset (a concurrent request's 401 → `runAllResets` →
 * `clearTechnicians`) must NOT repopulate the just-cleared store — the
 * previous session's technician would otherwise leak into memory and disk
 * (see services/resetRegistry.ts's epoch counter). Hydration: the roster
 * replaces the store wholesale (server-issued ids swap out the locally
 * fabricated `invite_` placeholders), but a pending on-device invite whose
 * phone the roster doesn't know yet survives — a profile GET that started
 * before the invite must not eat the row the user just added. That carry-over
 * expires after a TTL (a placeholder must never outlive its justification),
 * and locally removed technicians are tombstoned so hydration cannot
 * resurrect them from the roster while `remove` is still local-only.
 *
 * The store is probed through a tiny component (same pattern as
 * `useAuth.test.tsx`) because the hook returns actions; `hydrateTechnicianRoster`
 * is a standalone export and is called directly.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { technicianService } from '../../services';
import type { ProfileTechnician } from '../../services';
import { storage } from '../../services/storage';
import { runAllResets } from '../../services/resetRegistry';
import { DIAL_CODE } from './constants';
import {
  clearTechnicians,
  hydrateTechnicianRoster,
  useTechnicians,
} from './useTechnicians';
import type { NewTechnicianInput, Technician } from './types';

const invite = jest.spyOn(technicianService, 'invite');

/** Same key `useTechnicians.ts` persists under — kept in sync here. */
const MMKV_KEY = 'fenzit.technicians';

const INPUT: NewTechnicianInput = {
  name: 'Suresh Rao',
  phone: '9876500000',
  skillIds: ['skill-1'],
};

// Captured by the probe on every render — the hook's `add`/`remove` (stable
// useCallbacks) and the current store list.
let addFn: (input: NewTechnicianInput) => Promise<Technician>;
let removeFn: (id: string) => void;
let list: Technician[];

function Probe() {
  const technicians = useTechnicians();
  addFn = technicians.add;
  removeFn = technicians.remove;
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

// --- hydrateTechnicianRoster ------------------------------------------------

/** A roster exactly as `/users/me` embeds it: server ids, `invited`/`active`. */
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

it('replaces the store with the roster, mapped onto the local shape and persisted', () => {
  // act: the store write re-renders the mounted Probe — without it the
  // captured `list` lags one render behind.
  act(() => {
    hydrateTechnicianRoster(ROSTER);
  });

  expect(list).toEqual([
    {
      id: 'user-1', // server id — not the invite_ placeholder
      name: 'Suresh Rao',
      countryCode: '+91',
      phone: '9876500000',
      status: 'active', // backend `active` maps straight through
      invitedAt: '2026-09-18T09:00:00Z',
      skillIds: ['skill-1'],
    },
    {
      id: 'user-2',
      name: 'Meena Iyer',
      countryCode: '+91',
      phone: '9876511111',
      status: 'offline', // backend `invited` renders as offline
      invitedAt: '2026-09-19T09:00:00Z',
      skillIds: ['skill-2'],
    },
  ]);
  expect(persisted()).toEqual(list);
});

it('carries a pending on-device invite over when the roster does not know its phone yet', async () => {
  // Simulates the race: the invite commits locally, THEN a profile GET that
  // started before it settles with a roster missing the new row.
  await act(async () => {
    await addFn(INPUT);
  });

  act(() => {
    hydrateTechnicianRoster([ROSTER[1]]); // Meena only — Suresh's phone absent
  });

  // Carried-over rows keep their add-time position (newest first) instead of
  // dropping to the bottom while the roster hasn't caught up yet.
  expect(list.map(t => t.id)).toEqual(['invite_inv-1', 'user-2']);
  expect(persisted()).toEqual(list);
});

it('drops a pending invite once it outlives the carry-over TTL', async () => {
  jest.useFakeTimers();
  try {
    await act(async () => {
      await addFn(INPUT);
    });

    // Push the clock past the carry-over window: a roster that still doesn't
    // know the phone must now DROP the placeholder instead of carrying it —
    // a placeholder can never outlive its justification.
    jest.setSystemTime(jest.now() + 31 * 60 * 1000);
    act(() => {
      hydrateTechnicianRoster([ROSTER[1]]);
    });

    expect(list.map(t => t.id)).toEqual(['user-2']);
    expect(persisted()).toEqual(list);
  } finally {
    jest.useRealTimers();
  }
});

it('does not resurrect a locally removed technician from the roster', () => {
  act(() => {
    hydrateTechnicianRoster(ROSTER);
  });
  expect(list.map(t => t.id)).toEqual(['user-1', 'user-2']);

  act(() => {
    removeFn('user-1');
  });
  expect(list.map(t => t.id)).toEqual(['user-2']);

  // The roster still contains Suresh — hydration must honour the tombstone.
  act(() => {
    hydrateTechnicianRoster(ROSTER);
  });

  expect(list.map(t => t.id)).toEqual(['user-2']);
  expect(persisted()).toEqual(list);
});

it('tombstones by phone too, so a removed pending invite stays gone after its roster row appears', async () => {
  await act(async () => {
    await addFn(INPUT);
  });
  act(() => {
    removeFn('invite_inv-1');
  });
  expect(list).toEqual([]);

  // The roster now carries the same person under the real server id — the
  // phone tombstone (not the useless invite_ id) is what filters them out.
  act(() => {
    hydrateTechnicianRoster([ROSTER[0]]);
  });

  expect(list).toEqual([]);
  expect(persisted()).toEqual(list);
});

it('swaps the invite_ placeholder for the server record once the roster includes its phone', async () => {
  await act(async () => {
    await addFn(INPUT); // phone 9876500000 — ROSTER[0] is that same person
  });

  act(() => {
    hydrateTechnicianRoster(ROSTER);
  });

  expect(list.map(t => t.id)).toEqual(['user-1', 'user-2']);
  expect(list.some(t => t.id.startsWith('invite_'))).toBe(false);
  expect(persisted()).toEqual(list);
});
