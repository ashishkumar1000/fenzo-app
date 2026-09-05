/**
 * resetRegistry — the single list of "what a forced logout must wipe".
 *
 * Every module-level data store registers its reset function here at module
 * scope. When a request comes back 401 (session expired), the global handler
 * in `App.tsx` calls `runAllResets()`, and every registered store returns to
 * its pre-login state — so a fresh login can never see the previous
 * session's data.
 *
 * WHY a registry (and not App.tsx importing each store): stores live in
 * `features/`, and `services/` must never import from `features/`
 * (dependencies only flow one way, features → services). A new store joins
 * the reset by adding one `registerReset(...)` line to its own file — the
 * wiring in `App.tsx` never changes.
 *
 * Registration happens at module scope, i.e. the first time the store file
 * is imported. That is safe here: the reset functions close over module
 * state, so they behave identically no matter when they run.
 */

const resets = new Set<() => void>();

/**
 * Registers a reset function to run on forced logout. Returns an
 * unregister function — symmetric with `setOnUnauthorized`, and enough for
 * a test to clean up after itself (module-scope callers never unregister).
 */
export function registerReset(fn: () => void): () => void {
  resets.add(fn);
  return () => {
    resets.delete(fn);
  };
}

/**
 * Runs every registered reset exactly once, in registration order.
 *
 * One throwing reset must not stop the rest from running — a broken store
 * should degrade that one store, not leave the whole app holding the
 * previous session's data. Failures are logged, never rethrown: the caller
 * is the global 401 handler, which has no error surface.
 *
 * Iterates a snapshot, not the live set — a reset that (un)registers during
 * the run can't skip or duplicate entries.
 */
export function runAllResets(): void {
  [...resets].forEach(fn => {
    try {
      fn();
    } catch (e) {
      // Name the failing reset — an anonymous "reset failed" in production
      // logs is undiagnosable.
      console.warn('[resetRegistry] reset failed:', fn.name || '<anonymous>', '→', e);
    }
  });
}
