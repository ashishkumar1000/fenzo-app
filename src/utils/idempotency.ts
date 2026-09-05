/**
 * idempotency.ts
 * ──────────────
 * Generates a fresh UUID v4 per mutating request, for the backend's
 * `X-Idempotency-Key` replay-dedup contract (FR-17): the interceptor
 * regex-validates the key (anything but strict v4 is a 422) and replays the
 * stored response for 24h — so a key must be minted per action, never reused
 * across retries of DIFFERENT actions (Epic 4 replays the SAME key for one
 * queued action on purpose).
 *
 * Zero dependencies: a ladder over what the runtime offers —
 *   1. `crypto.randomUUID` (RN/Hermes ≥ 0.8x where available),
 *   2. `crypto.getRandomValues` + the RFC 4122 v4 bit-set done by hand
 *      (Hermes on RN 0.86 ships getRandomValues but not always randomUUID),
 *   3. plain `Math.random` bytes as the last resort.
 */

export function generateIdempotencyKey(): string {
  const g = globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (a: Uint8Array) => Uint8Array;
    };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();

  const bytes = g.crypto?.getRandomValues
    ? g.crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  // Set the v4 bits: version (high nibble of byte 6 = 0100) and the RFC's
  // two top bits of byte 8 = 10, so the output passes the backend's strict
  // v4 regex regardless of which rung produced the randomness.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}