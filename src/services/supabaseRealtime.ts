/**
 * supabaseRealtime.ts — the thin Supabase Realtime client (Story 3.3).
 *
 * One singleton `SupabaseClient`, configured so that supabase-js's own auth
 * module is completely bypassed (`persistSession: false`,
 * `autoRefreshToken: false`) — fenzit-be mints and owns our JWT lifecycle,
 * and a second session store would drift from the 401 reset flow. The
 * `accessToken` callback is the entire integration surface: supabase-js
 * calls it on every channel join (and reconnect) and it returns the
 * EXCHANGED short-lived token from `realtimeToken.ts → getRealtimeToken()`.
 * Realtime rejects the login JWT outright (no `exp`, `role` not a Postgres
 * role — Story 3.1's live spike), so this callback must never return it —
 * `getRealtimeToken()` already handles the login check and the in-memory
 * cache internally.
 *
 * Broadcast events come from the "Broadcast from Database" pattern (Story
 * 3.1's trigger fans `notifications` rows out to private topics), so the
 * channel is created with `config: { private: true }` — that is what makes
 * server-side RLS on `realtime.messages` authorize the subscription.
 *
 * The url polyfill is REQUIRED, not optional (proven by the Task 0 spike,
 * 2026-09-09): supabase-js's constructor rewrites the realtime URL's
 * protocol (`realtimeUrl.protocol = ...`), but Hermes's built-in `URL`
 * exposes `protocol` as a getter only, so the assignment crashes at module
 * import ("Cannot assign to property 'protocol' which has only a getter").
 * The whatwg-url polyfill implements the full URL spec (setters included).
 * `auto` installs it only when the globals are missing, so jest/node are
 * untouched. Must be imported BEFORE supabase-js (side-effect order).
 *
 * The TextDecoder polyfill is REQUIRED for the same reason (proven by the
 * Task 0 spike, 2026-09-09): "Broadcast from Database" delivers messages as
 * BINARY frames, and realtime-js's serializer (`_binaryDecode`) needs
 * `TextDecoder` to decode them — Hermes doesn't ship one, so every incoming
 * broadcast crashed with "Property 'TextDecoder' doesn't exist". The
 * polyfill only installs when the global is missing, so jest/node keep the
 * engine's own (and often faster) implementation. Same side-effect-order
 * rule: import BEFORE supabase-js.
 */
import 'react-native-url-polyfill/auto';
// Install only where the global is missing (Hermes) — jest/node keep the
// engine's own implementation. RN's tsconfig declares no TextDecoder global,
// hence the typed cast rather than a bare `globalThis.TextDecoder` read.
if (
  typeof (globalThis as { TextDecoder?: unknown }).TextDecoder === 'undefined'
) {
  // eslint-disable-next-line global-require, import/order -- polyfills must load before supabase-js
  require('text-encoding-polyfill');
}
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config';
import { getRealtimeToken } from './realtimeToken';

export const supabaseRealtime = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    // The exchanged short-lived token — NEVER the login JWT (see header).
    accessToken: async () => (await getRealtimeToken()) ?? '',
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

/**
 * The private topic a given user listens on — must match Story 3.1's
 * broadcast format exactly (`user:<user_id>:notifications`; the
 * `notifications_topic_recipient_only` RLS policy parses segment 2).
 */
export function ownerNotificationsTopic(userId: string): string {
  return `user:${userId}:notifications`;
}

/**
 * Builds (does not yet subscribe to) the owner's private notification
 * channel. Call `.on('broadcast', { event: 'INSERT' }, ...)` and
 * `.subscribe()` on the returned channel.
 */
export function getOwnerChannel(userId: string): RealtimeChannel {
  return supabaseRealtime.channel(ownerNotificationsTopic(userId), {
    config: { private: true },
  });
}

/**
 * Fully removes a channel from the client (unsubscribe + client-side
 * teardown) — used on app background, logout, and user switch, so a stale
 * channel object is never re-subscribed by accident.
 */
export function teardownOwnerChannel(channel: RealtimeChannel): void {
  // removeChannel can reject (e.g. channel left in a broken state after a
  // socket drop) — logged, silent to the user, same failure contract as the
  // token exchange.
  supabaseRealtime
    .removeChannel(channel)
    .catch((error: unknown) =>
      console.warn('[supabaseRealtime] removeChannel failed →', error),
    );
}
