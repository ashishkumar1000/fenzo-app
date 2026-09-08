/**
 * Tests for the shared `isAbort` helper — the one detection shape every
 * screen/hook uses to tell "our own abort" (a superseded request, or the
 * screen unmounting mid-flight) apart from a real API failure:
 *   — axios-shaped cancellation (`status: 0` + code `CANCELLED`);
 *   — a raw fetch `AbortError`, detected by `name`;
 *   — the request's own `AbortSignal` already aborted (whatever the thrown
 *     value is);
 * and the negative case: a genuine ApiError (real status/code) is never
 * misclassified, so its message still reaches the user.
 */
import { isAbort } from './isAbort';

describe('isAbort', () => {
  it('detects axios-style cancellation (status 0 + CANCELLED code)', () => {
    const error = { status: 0, code: 'CANCELLED', message: 'canceled' };
    expect(isAbort(error, new AbortController().signal)).toBe(true);
  });

  it('detects a raw fetch AbortError by name', () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isAbort(error, new AbortController().signal)).toBe(true);
  });

  it('detects the signal itself having been aborted, whatever was thrown', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbort(undefined, controller.signal)).toBe(true);
    expect(isAbort(new Error('whatever'), controller.signal)).toBe(true);
  });

  it('does not misclassify a real ApiError', () => {
    const error = {
      status: 502,
      code: 'PLACES_UPSTREAM_ERROR',
      message: 'Places is unavailable right now',
      details: null,
    };
    expect(isAbort(error, new AbortController().signal)).toBe(false);
  });

  it('does not misclassify a connection failure (status 0 without the CANCELLED code)', () => {
    const error = { status: 0, message: 'Network Error' };
    expect(isAbort(error, new AbortController().signal)).toBe(false);
  });

  it('does not misclassify a CANCELLED code without the zero status a real abort carries', () => {
    const error = { code: 'CANCELLED', message: 'canceled' };
    expect(isAbort(error, new AbortController().signal)).toBe(false);
  });
});
