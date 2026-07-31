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
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import { technicianService } from '../../services';
import { DIAL_CODE } from './constants';
import type { NewTechnicianInput, Technician } from './types';

const KEY = 'fenzit.technicians';

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

// --- Shared store: one list, any number of subscribers --------------------
const subscribers = new Set<() => void>();
let technicians: Technician[] = load();

function persist() {
  storage.set(KEY, JSON.stringify(technicians));
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
    // with a real server-issued technician id if a future `GET /technicians`
    // (or similar) is used to hydrate this store via `refresh()` — that
    // hydration should replace these entries outright rather than merge.
    const { inviteId } = await technicianService.invite({
      countryCode: DIAL_CODE,
      phoneNumber: input.phone.trim(),
      name: input.name.trim(),
      skillIds: input.skillIds,
    });
    const technician: Technician = {
      id: `invite_${inviteId}`,
      name: input.name.trim(),
      phone: input.phone.trim(),
      status: 'offline', // invited; flips to 'active' once they install the app
      invitedAt: new Date().toISOString(),
      skillIds: input.skillIds,
    };
    setTechnicians([technician, ...technicians]);
    return technician;
  }, []);

  const remove = useCallback((id: string) => {
    // INTEGRATION POINT: replace with `await technicianService.remove(id)`.
    setTechnicians(technicians.filter(t => t.id !== id));
  }, []);

  /** Replace the whole list — use to hydrate from a GET /technicians response. */
  const refresh = useCallback((next: Technician[]) => {
    setTechnicians(next);
  }, []);

  /** Clear all technicians — used on logout to reset the first-run state. */
  const clear = useCallback(() => {
    setTechnicians([]);
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
