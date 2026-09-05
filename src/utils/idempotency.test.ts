/**
 * Tests for the idempotency-key generator: every key must be a strict UUID v4
 * (the backend's IdempotencyInterceptor regex-rejects anything else with a
 * 422) and keys must not collide across a large batch — a repeated key within
 * the 24-hour window replays the first response instead of advancing.
 */
import { generateIdempotencyKey } from './idempotency';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateIdempotencyKey', () => {
  it('produces a strict lowercase UUID v4', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateIdempotencyKey()).toMatch(UUID_V4_RE);
    }
  });

  it('is unique over 1000 calls', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(1000);
  });

  it('still works when randomUUID is unavailable (falls back to getRandomValues)', () => {
    const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
    const original = g.crypto;
    // Hermes on RN 0.86 exposes getRandomValues but not always randomUUID —
    // force the ladder's second rung and require a valid key anyway.
    Object.defineProperty(g, 'crypto', {
      value: { getRandomValues: (a: Uint8Array) => original?.getRandomValues?.(a) ?? Uint8Array.from(a, () => Math.floor(Math.random() * 256)) },
      configurable: true,
    });
    try {
      for (let i = 0; i < 50; i += 1) {
        expect(generateIdempotencyKey()).toMatch(UUID_V4_RE);
      }
    } finally {
      Object.defineProperty(g, 'crypto', { value: original, configurable: true });
    }
  });
});