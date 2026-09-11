/**
 * useSkills — shared store for the global skills catalog, from `GET /skills`.
 *
 * Same `useSyncExternalStore` shared-store pattern as `useCustomers`: one
 * module-level state object, any number of subscribers. The Skills screen,
 * AddTechnicianSheet's skill picker and the New job screen's skill picker all
 * read the same fetch, so there is exactly one path to the endpoint and the
 * surfaces can never disagree about the rows.
 *
 * The read path serves the rows exactly as the backend sends them — seed
 * order (`sort_order` asc), active only — and never re-sorts. The write-path
 * mutations (`addSkill`, optimistic `removeSkill`) keep their sorted-insert
 * behavior untouched (both are Story 5.4 deletions).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { skillService } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import type { ApiError, Skill } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface SkillsState {
  skills: Skill[];
  /** True while the *first* load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoaded: boolean;
  /**
   * Timestamp of the last SUCCESSFUL load — drives the focus-refresh throttle.
   * A failed refresh never touches it, so a retry is never throttled away by
   * data that was already stale when the failure happened.
   */
  lastLoadedAt: number | null;
}

const INITIAL: SkillsState = {
  skills: [],
  // Starts true, so the very first render is a loader, never empty copy.
  isLoading: true,
  error: null,
  hasLoaded: false,
  lastLoadedAt: null,
};

// --- Shared store: one list, any number of subscribers ----------------------
const subscribers = new Set<() => void>();
let state: SkillsState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. SkillsScreen and AddTechnicianSheet's
 * sheet-open load landing in the same frame).
 */
let inFlight: Promise<void> | null = null;

/**
 * Monotonic id per request. A forced refresh runs *alongside* an older
 * in-flight request, so an older response can settle after a newer one —
 * and must not overwrite the newer state.
 */
let requestSeq = 0;

function setState(next: Partial<SkillsState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  // Same reference until something actually changes — required by
  // useSyncExternalStore to avoid an infinite re-render loop.
  return state;
}

/** Case-insensitive name order — used only by the write-path mutations. */
function byName(a: Skill, b: Skill) {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    // Case-equal names ("ac" vs "AC") still need a deterministic order.
    a.name.localeCompare(b.name)
  );
}

async function fetchSkills(): Promise<void> {
  const seq = ++requestSeq;
  // Only show the loader when there's nothing on screen yet; a refresh over
  // existing rows shouldn't blank them out.
  setState({ isLoading: state.skills.length === 0, error: null });
  try {
    const skills = await skillService.list();
    // A forced request can supersede this one (both run in parallel); a late
    // settling response from the older request must not overwrite the newer
    // state or stamp an older success.
    if (seq !== requestSeq) return;
    // Seed order (the backend's `sort_order` asc) is the contract — stored
    // verbatim, never re-sorted.
    setState({
      skills,
      isLoading: false,
      error: null,
      hasLoaded: true,
      lastLoadedAt: Date.now(),
    });
  } catch (error) {
    console.warn('[useSkills] GET /skills failed →', error);
    if (seq !== requestSeq) return;
    // `skills` is deliberately retained: a failed refresh keeps the stale
    // rows on screen and surfaces `error` as the dismissible banner. The
    // rejection isn't always an `ApiError` (aborted request, network
    // TypeError) — fall back to generic copy when the rejection carries no
    // usable message, so the failure still renders a banner.
    setState({
      isLoading: false,
      error: (error as ApiError)?.message || 'Something went wrong',
      hasLoaded: true,
    });
  }
}

/**
 * Loads the list, reusing any request already in flight.
 *
 * Throttled: a load whose last SUCCESS was within `FOCUS_REFRESH_TTL_MS` is
 * skipped, so a sheet-open `loadSkills()` on every open costs at most one
 * request per window. `opts.force` bypasses the throttle AND any in-flight
 * request — pull-to-refresh and post-mutation refreshes are always
 * intentional and must land immediately.
 */
export function loadSkills(opts: { force?: boolean } = {}): Promise<void> {
  // Only unforced callers may join the request already running: a forced
  // caller (post-mutation) needs data the old request started fetching
  // *before* the mutation, so joining it would resolve with pre-mutation
  // rows. Force issues a fresh request and runs alongside the old one.
  if (inFlight && !opts.force) {
    return inFlight;
  }
  // Elapsed time relative to the last success. A clock moving backwards
  // (NTP correction, manual change) makes elapsed negative, which must not
  // read as "fresh" — treat it as stale so refreshes keep flowing.
  const elapsed = Date.now() - (state.lastLoadedAt ?? 0);
  const fresh = elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
  if (!opts.force && fresh) {
    return Promise.resolve();
  }
  // Only clear the slot if THIS request is still the current one — a forced
  // call started while this one was in flight replaces `inFlight`, and the
  // older request's finally must not free the slot for it.
  const request = fetchSkills().finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });
  inFlight = request;
  return request;
}

/**
 * Creates a skill (`POST /skills`) and inserts it into the list in
 * alphabetical position — no follow-up refresh, the caller already holds the
 * full row from the response.
 *
 * Rejects with `ApiError` (409 `DUPLICATE_RESOURCE` for a duplicate name, per
 * the API contract) — the AddSkillSheet catches it to keep the sheet open and
 * show the inline copy instead of closing on a failed save.
 */
export async function addSkill(name: string): Promise<Skill> {
  const created = await skillService.create({ name });
  // Invalidate any GET that started before this create: its pre-mutation
  // response must not settle after this setState and drop the new row.
  requestSeq += 1;
  const rest = state.skills.filter(s => s.id !== created.id);
  setState({ skills: [...rest, created].sort(byName), hasLoaded: true, error: null });
  return created;
}

/**
 * Deletes a skill (`DELETE /skills/:id`) optimistically: the row leaves the
 * list immediately, and a failed call (anything except 404) puts it back —
 * a 404 means the skill is already gone server-side (deleted elsewhere), so
 * the removal stands and the call resolves instead of throwing.
 *
 * The backend delete CASCADES to `user_skills` — technicians silently lose
 * the skill — which is exactly what the screen's confirm dialog warns about;
 * nothing extra to handle client-side here.
 */
export async function removeSkill(id: string): Promise<void> {
  const snapshot = state.skills;
  const removed = snapshot.find(s => s.id === id) ?? null;
  setState({ skills: snapshot.filter(s => s.id !== id) });
  try {
    await skillService.remove(id);
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError?.status !== 404) {
      console.warn('[useSkills] DELETE /skills/:id failed →', error);
      // Restore ONLY this skill. A concurrent add or delete may have landed
      // while the request ran; restoring the whole pre-delete snapshot would
      // resurrect rows the server really has removed.
      if (removed && !state.skills.some(s => s.id === id)) {
        setState({ skills: [...state.skills, removed].sort(byName) });
      }
      throw error;
    }
    // 404: already deleted elsewhere — treated as success below, the removal
    // stands.
  }
  // The server agrees the skill is gone (or already was). Invalidate any GET
  // that started before this delete — its pre-delete response would otherwise
  // settle after this and resurrect the row.
  requestSeq += 1;
  setState({ skills: state.skills.filter(s => s.id !== id) });
}

/**
 * Reset to the pre-login state. Call on logout.
 *
 * Invalidates any in-flight GET and marks every older response stale — a
 * response landing after logout would otherwise repopulate the next session's
 * store with the previous tenant's skills.
 */
export function clearSkills() {
  requestSeq += 1;
  inFlight = null;
  setState(INITIAL);
}

// Join the global 401 reset flow (story 5.3) — see services/resetRegistry.ts.
registerReset(clearSkills);

export function useSkills(opts: { autoLoad?: boolean } = {}) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const autoLoad = opts.autoLoad ?? true;

  // First mount kicks off the load. Nothing to abort on unmount: the store
  // outlives the component, so a late response updates the store rather than
  // a dead component's state.
  //
  // `autoLoad: false` is for subscribers that stay mounted while hidden
  // (AddTechnicianSheet): without it, merely rendering the TechniciansScreen
  // fires a GET the user never asked for — the sheet loads on its own open
  // effect instead.
  useEffect(() => {
    if (autoLoad && !snapshot.hasLoaded && !inFlight) {
      void loadSkills();
    }
  }, [autoLoad, snapshot.hasLoaded]);

  /** Re-fetch — for pull-to-refresh and retry after a failed load. Always
   *  intentional, so it forces past the focus-refresh throttle. */
  const refresh = useCallback(() => loadSkills({ force: true }), []);

  return {
    skills: snapshot.skills,
    count: snapshot.skills.length,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    lastLoadedAt: snapshot.lastLoadedAt,
    refresh,
    clear: clearSkills,
  };
}
