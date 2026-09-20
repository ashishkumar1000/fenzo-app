/**
 * useTechnicians — the single source of truth for the owner's technician list.
 *
 * Same shared-store pattern as `useAuth`: one module-level array, any number
 * of subscribers via `useSyncExternalStore`, so Home's checklist, the More
 * tile and the Technicians screen all re-render together the moment a
 * technician is added. Persisted to MMKV (synchronous → no loading flash).
 *
 * `add` is wired to the real backend (`POST /auth/invite` via
 * `technicianService.invite`) and rejects with `ApiError` on failure —
 * callers must catch it. `remove` is still local-only (no DELETE
 * /technicians/:id documented yet); replace its body the same way once
 * that endpoint exists.
 *
 * `hydrateTechnicianRoster` replaces the whole store from the owner
 * profile's roster (`GET /users/me` → `technicians`) — the server-issued
 * records, which survive reinstalls and logouts that wipe the device-local
 * MMKV copy (the roster is what makes invites made on another install, or
 * before this one, visible again).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import { technicianService } from '../../services';
import type { ProfileTechnician } from '../../services';
import { currentResetEpoch, registerReset } from '../../services/resetRegistry';
import { DIAL_CODE } from './constants';
import type { NewTechnicianInput, Technician } from './types';

const KEY = 'fenzit.technicians';
/** Ids/phones of technicians removed locally while `remove` is still
 *  local-only (no DELETE endpoint) — persisted so hydration can filter them
 *  out of the server roster instead of resurrecting them. */
const REMOVED_KEY = 'fenzit.removedTechnicianIds';

/**
 * How long a locally committed `invite_` placeholder may keep being carried
 * over rosters that don't know its phone. The only reason a successful
 * invite's phone is absent from a roster is the in-flight race (a profile GET
 * that started before the invite — the backend has no invite revocation), so
 * the window only needs to outlive one request; it is generous so a slow
 * network or a backgrounded app never drops a real pending invite.
 */
const PENDING_INVITE_TTL_MS = 30 * 60 * 1000;

function load(): Technician[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Technician[]) : [];
  } catch {
    return [];
  }
}

function loadRemoved(): Set<string> {
  const raw = storage.getString(REMOVED_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

// --- Shared store: one list, any number of subscribers --------------------
const subscribers = new Set<() => void>();
let technicians: Technician[] = load();
let removedIds: Set<string> = loadRemoved();

function persist() {
  storage.set(KEY, JSON.stringify(technicians));
}

function persistRemoved() {
  storage.set(REMOVED_KEY, JSON.stringify([...removedIds]));
}

/** Remember a locally removed row so hydration never brings it back — by id
 *  (matches roster rows) and by phone (matches placeholder swaps). */
function tombstone(t: Technician): void {
  removedIds.add(`id:${t.id}`);
  removedIds.add(`phone:${t.phone}`);
  persistRemoved();
}

function setTechnicians(next: Technician[]) {
  technicians = next;
  persist();
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return technicians;
}

/** Clear all technicians — used on logout to reset the first-run state.
 *  Tombstones are cleared too: they are the *session's* removal intent, and
 *  without a server DELETE the technicians genuinely still exist — a fresh
 *  login should show them again. */
export function clearTechnicians(): void {
  setTechnicians([]);
  removedIds = new Set();
  persistRemoved();
}

// Join the global 401 reset flow (story 5.3) — see services/resetRegistry.ts.
registerReset(clearTechnicians);

/**
 * Maps a profile-roster row (`/users/me` → `technicians`, server-issued ids)
 * onto the local `Technician` shape. The backend's user status is
 * `invited` | `active` (see fenzit-be auth.service — invite creates
 * `invited`, first app login flips it to `active`); the local Badge
 * vocabulary only knows `active` | `offline`, so anything not yet `active`
 * renders as `offline`.
 */
function toTechnician(row: ProfileTechnician): Technician {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.countryCode,
    phone: row.phoneNumber,
    status: row.status === 'active' ? 'active' : 'offline',
    invitedAt: row.createdAt,
    skillIds: row.skillIds,
  };
}

/**
 * Replaces the store from the owner profile's roster. Replaces, not merges:
 * the roster is the server's truth, and swapping the locally fabricated
 * `invite_<inviteId>` rows for the real server-issued records is exactly the
 * point (job assignment needs the server ids).
 *
 * Three rules keep the replacement honest:
 *
 * 1. Locally removed technicians (see `remove`'s tombstones) are filtered out
 *    of the roster — without a server DELETE they would otherwise resurrect
 *    on every profile load.
 * 2. One carve-out keeps an in-flight race from eating a just-added
 *    technician: a profile GET that started *before* an invite and settles
 *    *after* it carries a roster without the new row. A local `invite_`
 *    entry whose phone is absent from the roster is therefore carried over —
 *    once the next roster includes that phone, the real server record
 *    replaces it and the `invite_` row disappears. The carry-over expires
 *    after `PENDING_INVITE_TTL_MS` so a placeholder can never outlive its
 *    justification (the backend has no invite revocation today, so absence
 *    from the roster can only ever be that race).
 * 3. Carried-over rows are PREPENDED (matching `add`'s newest-first
 *    ordering) so a just-added technician doesn't visibly drop to the bottom
 *    of the list while its roster row is still in flight.
 */
export function hydrateTechnicianRoster(roster: ProfileTechnician[]): void {
  const rosterPhones = new Set(roster.map(row => row.phoneNumber));
  const pendingInvites = technicians.filter(
    t =>
      t.id.startsWith('invite_') &&
      !rosterPhones.has(t.phone) &&
      Date.now() - Date.parse(t.invitedAt) < PENDING_INVITE_TTL_MS,
  );
  setTechnicians([
    ...pendingInvites,
    ...roster
      .filter(
        row =>
          !removedIds.has(`id:${row.id}`) &&
          !removedIds.has(`phone:${row.phoneNumber}`),
      )
      .map(toTechnician),
  ]);
}

export function useTechnicians() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const add = useCallback(async (input: NewTechnicianInput): Promise<Technician> => {
    // The backend only ever returns `{ invite_id }` — never the full
    // record — so the local Technician is built from what we already have
    // (name, phone, skillIds) plus that id. Rejects with `ApiError` on
    // failure; the caller (AddTechnicianSheet) is responsible for catching
    // it and showing the message.
    //
    // ⚠️ `invite_id` identifies the INVITE, not necessarily the eventual
    // technician/user record — the API reference gives no guarantee they're
    // the same value. Namespaced with `invite_` so it can never collide
    // with a real server-issued technician id. This placeholder row is
    // short-lived: the next profile load runs `hydrateTechnicianRoster`,
    // which swaps it for the real record from the roster (see that function
    // for the in-flight-invite carve-out).
    // Capture the reset epoch before the await: a concurrent request's 401
    // can tear the session down (runAllResets → clearTechnicians) while the
    // invite is in flight. The response below then must not repopulate the
    // just-cleared store — or its MMKV copy — with the previous session's
    // technician (see services/resetRegistry.ts).
    const epochAtStart = currentResetEpoch();
    const { inviteId } = await technicianService.invite({
      countryCode: DIAL_CODE,
      phoneNumber: input.phone.trim(),
      name: input.name.trim(),
      skillIds: input.skillIds,
    });
    const technician: Technician = {
      id: `invite_${inviteId}`,
      name: input.name.trim(),
      countryCode: DIAL_CODE,
      phone: input.phone.trim(),
      status: 'offline', // invited; flips to 'active' once they install the app
      invitedAt: new Date().toISOString(),
      skillIds: input.skillIds,
    };
    // The invite itself did succeed server-side, so the return value is
    // still valid for the caller — only the local write is skipped.
    if (currentResetEpoch() === epochAtStart) {
      setTechnicians([technician, ...technicians]);
    }
    return technician;
  }, []);

  const remove = useCallback((id: string) => {
    // INTEGRATION POINT: replace with `await technicianService.remove(id)`.
    // Until that DELETE endpoint exists, removal is local-only — tombstone
    // the row (by id AND phone) so `hydrateTechnicianRoster` filters it out
    // of the server roster instead of resurrecting it on the next profile
    // load.
    const victim = technicians.find(t => t.id === id);
    if (victim) {
      tombstone(victim);
      setTechnicians(technicians.filter(t => t.id !== id));
    }
  }, []);

  /** Replace the whole list raw — no caller today; roster hydration goes
   *  through `hydrateTechnicianRoster` instead (it maps the profile payload
   *  and keeps in-flight invites). Kept for a future GET /technicians. */
  const refresh = useCallback((next: Technician[]) => {
    setTechnicians(next);
  }, []);

  /** Clear all technicians — used on logout to reset the first-run state. */
  const clear = useCallback(() => {
    clearTechnicians();
  }, []);

  return {
    technicians: list,
    hasTechnicians: list.length > 0,
    count: list.length,
    activeCount: list.filter(t => t.status === 'active').length,
    offlineCount: list.filter(t => t.status === 'offline').length,
    add,
    remove,
    refresh,
    clear,
  };
}
