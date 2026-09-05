/**
 * Tests for the R2 PUT transport. The contract that matters:
 *   — a PUT (and nothing else) to the presigned URL with the file's mime
 *     as Content-Type and NO Authorization header (the URL is the auth);
 *   — resolves with the byte size the server actually received (the blob's
 *     own size, which the confirm phase then forwards);
 *   — any non-2xx response throws (the caller never retries the same URL);
 *   — a blob past `maxBytes` throws BEFORE the PUT (the size cap is enforced
 *     here because the true byte count only exists after the read);
 *   — the Blob is created via XMLHttpRequest (`responseType: 'blob'`), not
 *     `fetch(uri).blob()` — fetch-created blobs fail the PUT on iOS
 *     (device-verified 2026-09-05; see the module header in r2Upload.ts);
 *   — both the read and the PUT run under a 60 s deadline: a hung request
 *     rejects ("timed out") instead of pinning the tile on Uploading forever.
 */
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { putToPresignedUrl } from './r2Upload';

/** Fake XHR: `send` resolves (or errors) on the next microtask — or hangs. */
let xhrBlob: Blob | null = null;
let xhrFails = false;
let xhrHangs = false;
class FakeXhr {
  onerror: () => void = () => {};
  onreadystatechange: () => void = () => {};
  readyState = 0;
  response: Blob | null = null;
  responseType = '';
  open(): void {}
  abort(): void {}
  send(): void {
    if (xhrHangs) return; // never settles — only the timeout can end it
    void Promise.resolve().then(() => {
      if (xhrFails) {
        this.onerror();
        return;
      }
      this.readyState = 4;
      this.response = xhrBlob;
      this.onreadystatechange();
    });
  }
}
globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;

/** A blob stand-in with a controllable size (the confirm phase reads it). */
function fakeBlob(size: number): Blob {
  const blob = new Blob(['']);
  Object.defineProperty(blob, 'size', { value: size });
  return blob as Blob;
}

const CAP = 10 * 1024 * 1024;

beforeEach(() => {
  fetchMock.mockReset();
  xhrFails = false;
  xhrHangs = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('putToPresignedUrl', () => {
  it('reads via XHR and PUTs the blob with Content-Type and no auth header, resolving the blob size', async () => {
    xhrBlob = fakeBlob(2048);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })); // the PUT

    const size = await putToPresignedUrl(
      'https://r2.example.com/put?sig=1',
      'file:///tmp/photo.jpg',
      'image/jpeg',
      CAP,
    );

    expect(size).toBe(2048);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://r2.example.com/put?sig=1');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(init.body).toBeInstanceOf(Blob);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('allows a blob at EXACTLY the cap', async () => {
    xhrBlob = fakeBlob(CAP);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const size = await putToPresignedUrl(
      'https://r2.example.com/put?sig=1',
      'file:///tmp/photo.jpg',
      'image/jpeg',
      CAP,
    );

    expect(size).toBe(CAP);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws BEFORE the PUT when the blob exceeds maxBytes (no bytes uploaded)', async () => {
    xhrBlob = fakeBlob(CAP + 1);
    await expect(
      putToPresignedUrl(
        'https://r2.example.com/put?sig=1',
        'file:///tmp/huge.jpg',
        'image/jpeg',
        CAP,
      ),
    ).rejects.toThrow('exceeds the 10 MB limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx PUT (status included) and never retries', async () => {
    xhrBlob = fakeBlob(10);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      putToPresignedUrl(
        'https://r2.example.com/put?sig=1',
        'file:///tmp/photo.jpg',
        'image/png',
        CAP,
      ),
    ).rejects.toThrow('R2 PUT failed: 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the XHR file read fails', async () => {
    xhrFails = true;
    await expect(
      putToPresignedUrl(
        'https://r2.example.com/put?sig=1',
        'file:///tmp/missing.jpg',
        'image/jpeg',
        CAP,
      ),
    ).rejects.toThrow('could not read the file');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the XHR read completes without a blob payload', async () => {
    xhrBlob = null;
    await expect(
      putToPresignedUrl(
        'https://r2.example.com/put?sig=1',
        'file:///tmp/empty.jpg',
        'image/jpeg',
        CAP,
      ),
    ).rejects.toThrow('could not read the file');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('times out a hung PUT at 60 s and rejects (tile can land on Retry)', async () => {
    jest.useFakeTimers();
    xhrBlob = fakeBlob(10);
    // A fetch that never resolves on its own — only the abort signal ends it.
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const pending = putToPresignedUrl(
      'https://r2.example.com/put?sig=1',
      'file:///tmp/photo.jpg',
      'image/jpeg',
      CAP,
    );
    // Attach the rejection handler BEFORE the timer fires, or the rejection
    // lands unhandled and Jest fails the test for the warning, not the throw.
    const expectation = expect(pending).rejects.toThrow('R2 PUT timed out');
    // Just under the deadline: the PUT is in flight, nothing thrown yet.
    await jest.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The deadline fires: the abort surfaces as a timeout error.
    await jest.advanceTimersByTimeAsync(1);
    await expectation;
  });

  it('times out a hung file read at 60 s before any PUT is attempted', async () => {
    jest.useFakeTimers();
    xhrHangs = true;

    const pending = putToPresignedUrl(
      'https://r2.example.com/put?sig=1',
      'file:///tmp/stuck.jpg',
      'image/jpeg',
      CAP,
    );
    const expectation = expect(pending).rejects.toThrow('timed out reading the file');
    await jest.advanceTimersByTimeAsync(60_000);
    await expectation;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the deadline timer once the PUT settles', async () => {
    jest.useFakeTimers();
    xhrBlob = fakeBlob(10);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await putToPresignedUrl(
      'https://r2.example.com/put?sig=1',
      'file:///tmp/photo.jpg',
      'image/jpeg',
      CAP,
    );

    expect(jest.getTimerCount()).toBe(0);
    // A timer that leaked past the read would still fire at the 60 s mark.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
