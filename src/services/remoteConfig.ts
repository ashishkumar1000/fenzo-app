/**
 * remoteConfig.ts — server-driven app configuration (SPEC-server-driven-
 * config, CAP-1/2).
 *
 * Layering, in the order values take effect:
 *   1. Shipped defaults (REMOTE_CONFIG_DEFAULTS) — safe at import time.
 *   2. Last-known-good server values, persisted in MMKV — merged
 *      synchronously at module load, so every getter is correct even with
 *      the network down (CAP-2: a fresh offline install runs on defaults;
 *      a returning device runs on its last-known-good, never defaults).
 *   3. Fresh server values — `refreshRemoteConfig()` (fire-and-forget; the
 *      app calls it on start and on every foreground return).
 *
 * The refresh deliberately does NOT go through apiClient: the endpoint is
 * public, and the config fetch must not depend on the very timeout it
 * configures (that way lies circular bootstrapping). It carries no auth
 * header, which also keeps the CF edge cache's Authorization-strip rule
 * trivially satisfied.
 *
 * Unknown server keys are ignored and known keys are type-checked before
 * they may enter state — a malformed payload can never poison runtime
 * behavior (forward-compatibility constraint: old binaries must keep
 * working as the server grows the key set).
 */
import { API_BASE_URL, API_TIMEOUT } from '../config';
import { storage } from './storage';

export interface RemoteConfigValues {
  /** Minimum app version allowed against this API (semver). */
  min_supported_version: string;
  /** Copy shown by the forced-update screen. */
  force_update_message: string;
  /** Request timeout (ms) applied to API calls; apiClient clamps it. */
  api_timeout_ms: number;
  /** Non-empty = maintenance banner text shown in the app. */
  maintenance_banner: string;
}

/**
 * Defaults equal today's shipped behavior — a key used as a kill switch
 * must fail safe to current behavior when the server is unreachable.
 */
export const REMOTE_CONFIG_DEFAULTS: RemoteConfigValues = {
  min_supported_version: '1.0.0',
  force_update_message: 'Please update the Fenzit app to continue.',
  api_timeout_ms: API_TIMEOUT,
  maintenance_banner: '',
};

const STORAGE_KEY = 'remoteConfig.v1';
const FETCH_DEADLINE_MS = 5_000;
/** Foreground-refetch throttle; a cold start always fetches. */
const MIN_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type Listener = (values: RemoteConfigValues) => void;
const listeners = new Set<Listener>();

function pickKnown(raw: unknown): Partial<RemoteConfigValues> {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const picked: Partial<RemoteConfigValues> = {};
  if (typeof record.min_supported_version === 'string') {
    picked.min_supported_version = record.min_supported_version;
  }
  if (typeof record.force_update_message === 'string') {
    picked.force_update_message = record.force_update_message;
  }
  if (
    typeof record.api_timeout_ms === 'number' &&
    Number.isFinite(record.api_timeout_ms)
  ) {
    picked.api_timeout_ms = record.api_timeout_ms;
  }
  if (typeof record.maintenance_banner === 'string') {
    picked.maintenance_banner = record.maintenance_banner;
  }
  return picked;
}

function loadMerged(): RemoteConfigValues {
  try {
    const raw = storage.getString(STORAGE_KEY);
    return { ...REMOTE_CONFIG_DEFAULTS, ...pickKnown(raw ? JSON.parse(raw) : null) };
  } catch {
    return { ...REMOTE_CONFIG_DEFAULTS };
  }
}

let values: RemoteConfigValues = loadMerged();
let lastFetchStartedAtMs = 0;

/** Current effective config — safe to call at any time, including import. */
export function getRemoteConfig(): RemoteConfigValues {
  return values;
}

/** Subscribe to config changes; returns an unsubscribe function. */
export function onRemoteConfigChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply(picked: Partial<RemoteConfigValues>): boolean {
  if (Object.keys(picked).length === 0) return false;
  values = { ...values, ...picked };
  try {
    storage.set(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Persistence is best-effort; the in-memory values are already live.
  }
  for (const listener of listeners) listener(values);
  return true;
}

/**
 * Fetch the server config and overlay it. Returns true when a fetched value
 * actually changed state. Throttled to once per MIN_REFRESH_INTERVAL_MS
 * unless `force` (cold start / manual). Every failure mode — network drop,
 * timeout, non-200, malformed body — keeps the current values untouched.
 */
export async function refreshRemoteConfig(force = false): Promise<boolean> {
  const nowMs = Date.now();
  if (!force && nowMs - lastFetchStartedAtMs < MIN_REFRESH_INTERVAL_MS) {
    return false;
  }
  lastFetchStartedAtMs = nowMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_DEADLINE_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/config/app`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { config?: unknown } | null;
    return apply(pickKnown(body?.config));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Numeric semver-ish compare: > 0 if `a` is newer, < 0 if `b` is, 0 if
 * equal. Parses each dot segment numerically so 1.10.0 > 1.9.0 (a string
 * compare would get that wrong), and tolerates missing segments (1.0 == 1.0.0).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) =>
    version.split('.').map(part => parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Test hook: reset module state (re-reads the mocked storage). */
export function resetRemoteConfigForTests(): void {
  values = loadMerged();
  lastFetchStartedAtMs = 0;
}
