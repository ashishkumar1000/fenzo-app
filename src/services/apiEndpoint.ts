/**
 * apiEndpoint.ts
 * ────────────
 * Runtime-switchable API endpoint: production vs a local dev backend.
 *
 * Owns the *choice* (mode + optional local URL override) and exposes it to
 * `apiClient`, which applies the effective base URL to every request via its
 * request interceptor — so a switch takes effect on the NEXT request, with
 * no reload or restart. The choice persists in MMKV (same instance as
 * everything else), so it survives app restarts.
 *
 * Defaults come from `src/config` (`PROD_API_URL` / `DEFAULT_LOCAL_API_URL`);
 * only the mode and the local URL *override* live in storage. The local URL
 * is editable on the Settings screen so a changed LAN IP doesn't need a new
 * build.
 *
 * Listeners (`subscribe`) power the Settings screen's live UI — it re-renders
 * via `useSyncExternalStore` when the mode or URL changes.
 */
import { DEFAULT_LOCAL_API_URL, PROD_API_URL } from '../config';
import { storage } from './storage';

export type ApiEndpointMode = 'prod' | 'local';

const MODE_KEY = 'fenzit.apiEndpointMode';
const LOCAL_URL_KEY = 'fenzit.localApiUrl';

/** Shape consumed by the Settings UI — both values in one snapshot. */
export type ApiEndpointState = {
  mode: ApiEndpointMode;
  /** The local URL in force — the stored override, or the config default. */
  localUrl: string;
};

function readMode(): ApiEndpointMode {
  return storage.getString(MODE_KEY) === 'local' ? 'local' : 'prod';
}

function readLocalUrl(): string {
  // An empty stored string reads as "no override" — a URL is never validly
  // empty, so this keeps `setLocalApiUrl('')`-style accidents harmless.
  const stored = storage.getString(LOCAL_URL_KEY);
  return stored && stored.length > 0 ? stored : DEFAULT_LOCAL_API_URL;
}

export function getApiEndpointMode(): ApiEndpointMode {
  return readMode();
}

/** The URL `apiClient` should use for its next request. */
export function getEffectiveApiBaseUrl(): string {
  return readMode() === 'local' ? readLocalUrl() : PROD_API_URL;
}

export function getLocalApiUrl(): string {
  return readLocalUrl();
}

export function setLocalApiUrl(url: string): void {
  const normalized = normalizeApiUrl(url);
  // Same no-op contract as setApiEndpointMode: re-saving the value already
  // in force must not wake every subscribed screen.
  if (readLocalUrl() === normalized) return;
  storage.set(LOCAL_URL_KEY, normalized);
  notify();
}

export function setApiEndpointMode(mode: ApiEndpointMode): void {
  if (readMode() === mode) return;
  storage.set(MODE_KEY, mode);
  notify();
}

/**
 * Trims, drops trailing slashes, and rejects anything that isn't an
 * `http(s)://` URL. Only well-formedness — no DNS/liveness check (the app
 * shows API errors on the next request anyway). Embedded credentials
 * (`http://user:pass@host`) are rejected too: a backend URL never carries
 * them, and a typo'd paste must not end up in storage.
 */
export function normalizeApiUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/i.test(trimmed) || /^https?:\/\/[^/]*@/i.test(trimmed)) {
    throw new Error('Enter a full URL starting with http:// or https://');
  }
  return trimmed;
}

/* ── change notification ────────────────────────────────────────────────
 * A minimal pub-sub for `useSyncExternalStore`. Listeners live only while a
 * screen is subscribed, so there is no leak across navigation. */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeApiEndpoint(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for `useSyncExternalStore` — stable identity while unchanged.
 * `useSyncExternalStore` compares snapshots with `Object.is`, so returning a
 * fresh object literal per call would loop forever (maximum update depth
 * exceeded); the object is rebuilt only when a value actually changes. */
let cachedSnapshot: ApiEndpointState | null = null;
let cachedMode: ApiEndpointMode | null = null;
let cachedLocalUrl: string | null = null;

export function getApiEndpointSnapshot(): ApiEndpointState {
  const mode = readMode();
  const localUrl = readLocalUrl();
  if (cachedSnapshot === null || cachedMode !== mode || cachedLocalUrl !== localUrl) {
    cachedSnapshot = { mode, localUrl };
    cachedMode = mode;
    cachedLocalUrl = localUrl;
  }
  return cachedSnapshot;
}

function notify(): void {
  // One throwing listener (e.g. a render crash mid-sync) must not starve
  // the rest of the subscribers into a stale snapshot.
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('apiEndpoint listener threw', error);
    }
  }
}