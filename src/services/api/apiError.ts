/**
 * apiError.ts
 * ───────────
 * Everything related to turning a raw axios failure into the one error
 * shape the rest of the app deals with: `ApiError`.
 *
 * Why this exists as its own file (and not inlined in apiClient.ts):
 * error-mapping logic tends to grow (new status codes, new backend error
 * formats) independently of the client setup. Keeping it separate means
 * changing "what a 409 means" never requires touching how axios is
 * configured, and vice versa.
 */
import axios from 'axios';
import type { AxiosError } from 'axios';

/**
 * The normalized error every failed request rejects with.
 *
 * Every service method (`ApiService.list`, `.create`, etc.) and every
 * handwritten call through `apiClient` surfaces failures in this shape —
 * callers never need to know axios exists, or branch on error type.
 */
export interface ApiError {
  /** HTTP status code. `0` means the request never got a response (network down, DNS failure, timeout, or client-side cancellation). */
  status: number;
  /**
   * Machine-readable bucket for programmatic handling, e.g. checking
   * `if (err.code === 'UNAUTHORIZED')`. Prefers the backend's own `code`
   * field when present, otherwise falls back to a status-based default
   * (see `defaultCodeForStatus`).
   */
  code: string;
  /** Human-readable message. Safe to render directly in UI as a fallback if the caller has no more specific copy for this error. */
  message: string;
  /** Raw response body from the backend, if any. Use this when a screen needs field-level validation errors rather than just the top-line message. */
  details?: unknown;
}

/**
 * Converts any axios failure (network error, timeout, cancelled request, or
 * HTTP error response) into an `ApiError`. Called from the response
 * interceptor in `apiClient.ts` — nothing else should need to call this
 * directly.
 *
 * @param error - The error axios rejected the request with.
 * @param onUnauthorized - Optional callback invoked when the response is a 401, e.g. to trigger a logout. Kept as a parameter (rather than imported) so this module has no dependency on auth/session code.
 */
export function toApiError(error: AxiosError, onUnauthorized?: () => void): ApiError {
  // No `response` means the request never completed: offline, DNS failure,
  // server unreachable, timeout, or an aborted/cancelled request.
  if (!error.response) {
    // Check timeout FIRST: axios sets `code: 'ECONNABORTED'` explicitly for
    // its own timeout regardless of adapter (XHR or fetch), but some fetch-
    // adapter internals implement that timeout via an AbortController too —
    // checking cancellation first could then mislabel a timeout as a
    // deliberate `CANCELLED` cancellation. Checking ECONNABORTED first keeps
    // timeouts correctly classified either way.
    const isTimeout = error.code === 'ECONNABORTED';
    if (isTimeout) {
      return {
        status: 0,
        code: 'TIMEOUT',
        message: 'The request took too long. Check your connection and try again.',
      };
    }

    // A request cancelled via `createCancelSignal().cancel()` (e.g. on
    // unmount) is not a failure — flag it distinctly so callers can ignore
    // it silently instead of showing a "network error" toast for something
    // the app did on purpose.
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return {
        status: 0,
        code: 'CANCELLED',
        message: 'Request was cancelled.',
      };
    }

    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }


  const { status, data } = error.response;
  // Backends are expected to send `{ code, message }` on error responses.
  // Both are optional here because we can't guarantee every endpoint (or
  // every failure mode, e.g. a 502 from a proxy) follows that contract.
  const payload = data as { code?: string; message?: string } | undefined;

  if (status === 401) {
    onUnauthorized?.();
  }

  return {
    status,
    code: payload?.code ?? defaultCodeForStatus(status),
    message: payload?.message ?? defaultMessageForStatus(status),
    details: data,
  };
}

/** Machine-readable fallback when the backend response has no `code` field. */

function defaultCodeForStatus(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'REQUEST_ERROR';
}

/** Human-readable fallback when the backend response has no `message` field. */
function defaultMessageForStatus(status: number): string {
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found.";
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return 'Something went wrong with that request.';
}
