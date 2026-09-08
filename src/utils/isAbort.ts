/**
 * True when a failure is the app's own abort (a superseded request, or the
 * screen unmounting mid-flight), not a real error — detected by shape
 * (axios' `status: 0` + `CANCELLED` code), by name (a raw fetch
 * `AbortError`), or by the signal itself having been aborted.
 *
 * `error` is typed `unknown` so every catch site can pass what it caught
 * without a cast — the checks only look for the abort markers and return
 * false for anything else.
 */
export function isAbort(error: unknown, signal: AbortSignal): boolean {
  const apiError = error as
    | { status?: number; code?: string; name?: string }
    | undefined
    | null;
  return (
    (apiError?.status === 0 && apiError?.code === 'CANCELLED') ||
    apiError?.name === 'AbortError' ||
    signal.aborted
  );
}
