/**
 * services/attendanceAccessEvents.ts
 * ───────────────────────────────────
 * The neutral seam between the notifications realtime bridge and the
 * technician attendance access store (Story 15-10).
 *
 * The architecture spine's module boundary forbids BOTH import directions:
 * `notifications` may not import `attendance`, and `attendance` may not
 * import `notifications`. This module is the neutral third party (same
 * one-line-registrant pattern as `resetRegistry.ts`): the bridge emits
 * `attendance.*` events here, the access store registers its refetch and
 * publishes tab reachability, and the notifications screen reads
 * reachability to guard its card taps — each side knows only this file.
 */

/** The access store's refetch callback (registered while the tech tree lives). */
export type AttendanceAccessRefresh = () => void;

let refreshListener: AttendanceAccessRefresh | null = null;

/**
 * Whether the Attendance tab currently exists for this user
 * (`attendanceAccess !== 'none'`, resolved). The store publishes; the
 * notifications screen's tap guard reads. Defaults false — a notification
 * deep link can never open a tab that does not exist (FR-3: no attendance
 * UI anywhere for `none`).
 */
let reachable = false;

/**
 * Registers the store's refetch. Returns the unregister function. One
 * registrant at a time (the technician tree is a singleton); a later
 * registration replaces the earlier one, mirroring resetRegistry.
 */
export function registerAttendanceAccessRefresh(fn: AttendanceAccessRefresh): () => void {
  refreshListener = fn;
  return () => {
    if (refreshListener === fn) {
      refreshListener = null;
    }
  };
}

/** Bridge seam: a `attendance.*` realtime event landed — refetch access. */
export function emitAttendanceAccessRefresh(): void {
  refreshListener?.();
}

/** Store seam: publish the tab's current existence (called on every state change). */
export function setAttendanceReachable(value: boolean): void {
  reachable = value;
}

/** Notifications seam: may an attendance card tap open the Attendance tab? */
export function isAttendanceReachable(): boolean {
  return reachable;
}

/** True for every `attendance.*` event type (matched in the notifications layer). */
export function isAttendanceEventType(eventType: string): boolean {
  return typeof eventType === 'string' && eventType.startsWith('attendance.');
}

/** 401/epoch reset: drop the registrant and slam the tab shut. */
export function resetAttendanceAccessEvents(): void {
  refreshListener = null;
  reachable = false;
}
