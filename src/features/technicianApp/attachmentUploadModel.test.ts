/**
 * Tests for the upload pipeline (the state machine behind Story 3.4): the
 * per-file sequence presign → PUT → confirm, the failure branches (expiry,
 * 410 single auto-restart, 409 limit) and the idempotency-key lifecycle —
 * every attempt mints a FRESH key for each API call, and a retry restarts
 * the WHOLE action from presign (the old presigned URL is never reused).
 *
 * Deps are injected, so nothing here mocks axios or React.
 */
import {
  confirmOnly,
  runUploadPipeline,
  type UploadDeps,
  type UploadEntry,
} from './attachmentUploadModel';

const PRESIGN_A = {
  presignedPutUrl: 'https://r2.example.com/a?sig=1',
  uploadId: 'upload-a',
  key: 'k-a',
  expiresAt: '2026-09-05T00:15:00.000Z',
};
const PRESIGN_B = { ...PRESIGN_A, uploadId: 'upload-b', key: 'k-b' };
const CONFIRMED = { id: 'att-1', type: 'photo' as const, createdAt: '2026-09-05T00:01:00.000Z' };

function entry(): UploadEntry {
  return {
    localId: 'local-1',
    fileUri: 'file:///tmp/photo.jpg',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    phase: 'presigning',
  };
}

/** Deps with defaults per test; `now` starts at the presign window's start. */
function makeDeps(overrides: Partial<UploadDeps> = {}): UploadDeps & { keys: string[] } {
  const keys: string[] = [];
  const deps: UploadDeps = {
    presign: jest.fn(async (_jobId: string, _body: unknown, key: string) => {
      keys.push(`presign:${key}`);
      return PRESIGN_A;
    }),
    put: jest.fn(async () => 2048),
    confirm: jest.fn(async (_jobId: string, _uploadId: string, _size: number, key: string) => {
      keys.push(`confirm:${key}`);
      return CONFIRMED;
    }),
    now: () => 0,
    freshKey: () => `key-${keys.length + 1}`,
    ...overrides,
  };
  return Object.assign(deps, { keys });
}

/** Error-shaped rejection, matching `ApiError`'s `status` field. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('runUploadPipeline — happy path', () => {
  it('walks presigning → uploading → confirming → done and resolves done', async () => {
    const phases: string[] = [];
    const deps = makeDeps();
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, e => phases.push(e.phase));
    expect(outcome).toBe('done');
    expect(phases).toEqual(['presigning', 'uploading', 'confirming', 'done']);
    expect(deps.put).toHaveBeenCalledWith(PRESIGN_A.presignedPutUrl, 'file:///tmp/photo.jpg', 'image/jpeg');
    expect(deps.confirm).toHaveBeenCalledWith('job-1', 'upload-a', 2048, expect.any(String));
  });

  it("carries the PUT's measured sizeBytes (not a picker value) into confirm", async () => {
    const deps = makeDeps({ put: async () => 777 });
    await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(deps.confirm).toHaveBeenCalledWith('job-1', 'upload-a', 777, expect.any(String));
  });

  it('mints a FRESH key per API call within one attempt (no reuse)', async () => {
    const deps = makeDeps();
    await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(deps.keys).toEqual(['presign:key-1', 'confirm:key-2']);
  });

  it("sends the entry's attachmentType in the presign body", async () => {
    const seen: unknown[] = [];
    const deps = makeDeps({
      presign: async (_jobId, body, key) => {
        seen.push(body);
        return PRESIGN_A;
      },
    });
    await runUploadPipeline('job-1', 'signature', entry(), deps, () => {});
    expect(seen).toEqual([
      { filename: 'photo.jpg', mimeType: 'image/jpeg', attachmentType: 'signature' },
    ]);
  });
});

describe('runUploadPipeline — presign response shape', () => {
  // A 200 presign missing its routing fields would otherwise PUT the whole
  // file and only fail at confirm (404 on /undefined/confirm) — bytes that
  // can never be confirmed. Fail before the PUT instead.
  it('fails without PUTting when the presign body lacks uploadId', async () => {
    const deps = makeDeps({
      presign: async () => ({ ...PRESIGN_A, uploadId: undefined as unknown as string }),
    });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('fails without PUTting when the presign body lacks presignedPutUrl', async () => {
    const deps = makeDeps({
      presign: async () => ({ ...PRESIGN_A, presignedPutUrl: '' }),
    });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.put).not.toHaveBeenCalled();
  });
});

// The API client rejects with a PLAIN ApiError object, not an Error instance
// — String() of one renders "[object Object]". The tile's error copy must be
// the backend's message instead.
describe('runUploadPipeline — error copy from plain-object API errors', () => {
  it('surfaces the ApiError message (not "[object Object]") on a presign failure', async () => {
    const deps = makeDeps({
      // A faithful ApiError: a plain object — NOT an Error instance, so
      // String() of it is "[object Object]".
      presign: async () => {
        throw { status: 422, code: 'INVALID_VALIDATION', message: 'filename must be a string' };
      },
    });
    const errors: Array<string | undefined> = [];
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, e => {
      if (e.phase === 'failed') errors.push(e.error);
    });
    expect(outcome).toBe('failed');
    expect(errors).toEqual(['filename must be a string']);
  });

  it('falls back to String() for genuine Error rejections (transport layer)', async () => {
    const deps = makeDeps({ put: async () => { throw new Error('R2 PUT failed: 500'); } });
    const errors: Array<string | undefined> = [];
    await runUploadPipeline('job-1', 'photo', entry(), deps, e => {
      if (e.phase === 'failed') errors.push(e.error);
    });
    expect(errors).toEqual(['R2 PUT failed: 500']);
  });
});

describe('runUploadPipeline — expiry pre-check', () => {
  it('fails without PUTting when the presign URL is already expired', async () => {
    const deps = makeDeps({ now: () => 9_000_000_000_000 });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  // Review patch: a malformed/missing expiresAt parses to NaN, and any
  // comparison against NaN is false — which would SKIP the expiry check and
  // PUT bytes into a URL whose validity is unknown. Fail safe instead.
  it('treats a malformed expiresAt (NaN) as expired and fails before the PUT', async () => {
    const deps = makeDeps({
      presign: async () => ({ ...PRESIGN_A, expiresAt: 'not-a-date' }),
    });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('treats a missing expiresAt as expired and fails before the PUT', async () => {
    const deps = makeDeps({
      presign: async () => ({ ...PRESIGN_A, expiresAt: undefined as unknown as string }),
    });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.put).not.toHaveBeenCalled();
  });
});

describe('runUploadPipeline — 0-byte PUT guard', () => {
  // Review patch: a 0-byte PUT is never a valid photo — confirm's min(1)
  // would 422 deterministically. Fail with the same Retry path, pre-confirm.
  it('fails BEFORE confirm when the PUT measures 0 bytes', async () => {
    const deps = makeDeps({ put: async () => 0 });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.presign).toHaveBeenCalledTimes(1); // no auto-restart either
  });

  it('lets a 1-byte PUT through (the floor is exclusive only below 1)', async () => {
    const deps = makeDeps({ put: async () => 1 });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('done');
    expect(deps.confirm).toHaveBeenCalledWith('job-1', 'upload-a', 1, expect.any(String));
  });
});

describe('runUploadPipeline — failure branches', () => {
  it('fails on a PUT error without touching confirm', async () => {
    const deps = makeDeps({ put: async () => { throw httpError(403); } });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('reports limit (and skips confirm) on a presign 409', async () => {
    const deps = makeDeps({ presign: async () => { throw httpError(409); } });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('limit');
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('reports limit on a confirm 409', async () => {
    const deps = makeDeps({ confirm: async () => { throw httpError(409); } });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('limit');
  });
});

describe('runUploadPipeline — confirm 410 (expired presign)', () => {
  it('silently restarts the WHOLE action from presign exactly once', async () => {
    const deps = makeDeps({
      presign: jest
        .fn()
        .mockResolvedValueOnce(PRESIGN_A)
        .mockResolvedValueOnce(PRESIGN_B),
    });
    // First confirm attempt 410s; the restarted attempt succeeds.
    (deps.confirm as jest.Mock)
      .mockRejectedValueOnce(httpError(410))
      .mockResolvedValueOnce(CONFIRMED);
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('done');
    // One confirm per presign: the restart re-PUTs to the FRESH url, so
    // two presigns, two PUTs, two confirms — and nothing more.
    expect(deps.presign).toHaveBeenCalledTimes(2);
    expect(deps.put).toHaveBeenCalledTimes(2);
    expect(deps.confirm).toHaveBeenCalledTimes(2);
    // Second attempt PUT to the NEW presigned url — the old one is never reused.
    expect(deps.put).toHaveBeenNthCalledWith(2, PRESIGN_B.presignedPutUrl, 'file:///tmp/photo.jpg', 'image/jpeg');
  });

  it('gives up as failed after a SECOND 410 (no infinite restart)', async () => {
    const deps = makeDeps({
      confirm: jest.fn(async () => { throw httpError(410); }),
    });
    const outcome = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(outcome).toBe('failed');
    expect(deps.presign).toHaveBeenCalledTimes(2);
    expect(deps.confirm).toHaveBeenCalledTimes(2);
  });

  // Review patch: the uploadId/sizeBytes judged dead by the 410 must not
  // leak into the restarted attempt — the 'confirming' emission of the
  // restart carries the NEW presign's uploadId, not 'upload-a'.
  it('carries the FRESH uploadId into the restarted confirm (no dead ids)', async () => {
    const deps = makeDeps({
      presign: jest
        .fn()
        .mockResolvedValueOnce(PRESIGN_A)
        .mockResolvedValueOnce(PRESIGN_B),
    });
    (deps.confirm as jest.Mock)
      .mockRejectedValueOnce(httpError(410))
      .mockResolvedValueOnce(CONFIRMED);
    const confirmingUploadIds: string[] = [];
    await runUploadPipeline('job-1', 'photo', entry(), deps, e => {
      if (e.phase === 'confirming') confirmingUploadIds.push(e.uploadId ?? '');
    });
    expect(confirmingUploadIds).toEqual(['upload-a', 'upload-b']);
  });
});

describe('runUploadPipeline — retry starts over with fresh keys', () => {
  it('a second run after a failure uses entirely NEW idempotency keys', async () => {
    const deps = makeDeps({ put: async () => { throw httpError(500); } });
    const first = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(first).toBe('failed');
    // The retry: same entry, fresh attempt — presign must be called again
    // (the old URL is dead) with a key not seen in attempt one.
    const second = await runUploadPipeline('job-1', 'photo', entry(), deps, () => {});
    expect(second).toBe('failed');
    expect(deps.keys).toEqual([
      'presign:key-1',
      'presign:key-2',
    ]);
  });
});

describe('confirmOnly (Epic-4 seam, AC 7)', () => {
  it('replays JUST the confirm and resolves done — never re-PUTs', async () => {
    const confirm = jest.fn(async () => CONFIRMED);
    const freshKey = () => 'key-replay';
    const outcome = await confirmOnly('job-1', 'upload-a', 2048, { confirm, freshKey });
    expect(outcome).toBe('done');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('job-1', 'upload-a', 2048, 'key-replay');
  });

  it('maps a confirm 409 to limit', async () => {
    const confirm = jest.fn(async () => { throw httpError(409); });
    const outcome = await confirmOnly('job-1', 'upload-a', 2048, {
      confirm,
      freshKey: () => 'k',
    });
    expect(outcome).toBe('limit');
  });

  it('maps any other confirm error to failed', async () => {
    const confirm = jest.fn(async () => { throw httpError(410); });
    const outcome = await confirmOnly('job-1', 'upload-a', 2048, {
      confirm,
      freshKey: () => 'k',
    });
    expect(outcome).toBe('failed');
  });

  it('mints a fresh key per replay attempt', async () => {
    const keys: string[] = [];
    const confirm = jest.fn(async (_j: string, _u: string, _s: number, key: string) => {
      keys.push(key);
      throw httpError(500);
    });
    await confirmOnly('job-1', 'upload-a', 2048, {
      confirm,
      freshKey: () => `key-${keys.length + 1}`,
    });
    await confirmOnly('job-1', 'upload-a', 2048, {
      confirm,
      freshKey: () => `key-${keys.length + 1}`,
    });
    expect(keys).toEqual(['key-1', 'key-2']);
  });
});
