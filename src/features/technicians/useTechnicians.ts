/**
 * useTechnicians — the single source of truth for the owner's technician list.
 *
 * Same shared-store pattern as `useAuth`: one module-level array, any number
 * of subscribers via `useSyncExternalStore`, so Home's checklist, the More
 * tile and the Technicians screen all re-render together the moment a
 * technician is added. Persisted to MMKV (synchronous → no loading flash).
 *
 * INTEGRATION POINT (backend): the three mutators below — `add`, `remove`,
 * `refresh` — are the only places that touch data. When the real API is ready,
 * replace their bodies with API calls (e.g. POST /technicians) and hydrate the
 * store from the response; every screen that consumes this hook stays unchanged.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
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

function makeId() {
  return `tech_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useTechnicians() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const add = useCallback((input: NewTechnicianInput): Technician => {
    // INTEGRATION POINT: replace with `await technicianService.invite(input)`.
    const technician: Technician = {
      id: makeId(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      status: 'offline', // invited; flips to 'active' once they install the app
      invitedAt: new Date().toISOString(),
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
