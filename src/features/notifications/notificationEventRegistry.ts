/**
 * notificationEventRegistry.ts — the frontend event-type registry
 * (Story 14-3, per AD-19 / UX-DR7). Keyed on the row's `eventType` (+
 * `jobId`), it decides each notification's card kind and, by way of the
 * card kind, its deep link and which UI it may touch. No React, no network.
 *
 * Three card KINDS today (story 19-4 adds the attendance card for both
 * roles):
 *   'job'        — a job-status event (eventType = a workflow step key,
 *                  jobId set) → the grouped job card → JobDetail (owner) /
 *                  TechJobDetail (technician).
 *   'report'     — the report engine's terminal events (Epic 12) → the
 *                  report card → Reports. OWNER-only: reports are an owner
 *                  surface, so a technician row of this type renders
 *                  generic.
 *   'attendance' — holiday events (15-6, technician) AND, from 19-4, the
 *                  three attendance reminders (employee personal reminders
 *                  + the owner's not-checked-in summary) — composed copy
 *                  (the payload is display DATA, not display text), with a
 *                  tap the screen guards: the technician tab rows only
 *                  navigate while the Attendance tab exists; the owner
 *                  card lands on the AttendanceDashboard.
 *   'leave'      — the leave cards (17-6), role-keyed ENUMERATED
 *                  classifications of the shipped events (19-4 adds
 *                  leave.pending_reminder to the owner list).
 *   'generic'    — anything else, including event types this build has
 *                  never seen (the AD-19 fallback). Renders a plain,
 *                  non-tappable card and NEVER touches job UI.
 *
 * Rows written before Story 14-2 carry NULL entityType/entityId — they are
 * classified by eventType + jobId exactly as before, so owner job/report
 * behaviour is bit-identical to the pre-registry screen. New event families
 * (attendance/leave) plug in here without touching the bridge, the screen
 * or the job card pipeline.
 */
import type { ApiNotification } from '../../services';
import { isAttendanceEventType } from '../../services/attendanceAccessEvents';
import {
  ATTENDANCE_NOTIFICATION_EVENT,
} from '../attendance/notifications/notificationEvents';
import { formatLongDate } from '../../utils/formatLongDate';
import { isReportNotification } from './reportNotificationModel';
import {
  isLeaveEmployeeEvent,
  isLeaveOwnerEvent,
} from './leaveNotificationModel';

/** What a notification row renders as on the shared inbox. */
export type NotificationEventAction =
  | 'job'
  | 'report'
  | 'attendance'
  | 'leave'
  | 'generic';

/** The signed-in session's role (`useAuth`) — the registry's second key. */
export type SessionRole = 'owner' | 'technician';

/**
 * Classifies one notification row. Unknown event types fall through to
 * 'generic' — the registry is a closed vocabulary, so a later epic's new
 * event types render the generic card (not a broken one) until this build
 * learns them.
 */
export function notificationEventAction(
  n: ApiNotification,
  role: SessionRole,
): NotificationEventAction {
  if (role === 'owner' && isReportNotification(n)) return 'report';
  // Story 19-4 (spec D8): the three attendance reminders compose their own
  // cards — ROLE-AGNOSTIC for these three literals (two employee personal
  // reminders + the owner's office summary). Everything else `attendance.*`
  // keeps the status quo below: the technician prefix arm — the owner-side
  // `attendance.*` rows that fell through to generic before 19-4 still do,
  // except these three.
  if (isAttendanceReminderEvent(n.eventType)) return 'attendance';
  // Story 15-10: attendance.* rows are a technician surface — they carry
  // composed copy (the payload is display DATA, not display text) and a
  // tap-guarded deep link to the Attendance tab (the seam decides whether
  // that tab currently exists).
  if (role === 'technician' && isAttendanceEventType(n.eventType)) return 'attendance';
  // Story 17-6: the leave cards — role-keyed ENUMERATED classifications of
  // exactly the shipped events (wire-truth F6). 19-4 adds the 9th owner
  // event, `leave.pending_reminder`, WITH its composed copy (the original
  // generic-card deferral is retired — see leaveNotificationModel).
  if (role === 'owner' && isLeaveOwnerEvent(n.eventType)) return 'leave';
  if (role === 'technician' && isLeaveEmployeeEvent(n.eventType)) return 'leave';
  if (n.jobId !== null) return 'job';
  return 'generic';
}

/** EXACTLY the 19-4 reminder literals, enumerated (never a prefix sweep —
 *  a future `attendance.reminder_*` must stay generic until composed). */
function isAttendanceReminderEvent(eventType: string): boolean {
  return (
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKIN ||
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKOUT ||
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN
  );
}

/** Generic title when the payload carries no usable text. */
const GENERIC_FALLBACK_TITLE = 'Notification';

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Humanizes an unknown event type for the generic card title:
 * `leave_approved` → "Leave approved". Purely cosmetic — the event type
 * string is stable by design (push-ready payloads), so this never churns.
 */
function humanizeEventType(eventType: string): string {
  const text = eventType.replace(/_/g, ' ').trim();
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : GENERIC_FALLBACK_TITLE;
}

/**
 * One generic notification's card — one notification row = one card (same
 * contract as report cards; there is nothing to group an unknown-type row
 * on). There is NO deep link: the card is not tappable, so a tap can never
 * touch job UI. Fields come from the payload's self-contained display text
 * when present, else from the humanized event type.
 */
export interface GenericNotificationCardData {
  kind: 'generic';
  /** The notification row's id — the FlatList key. */
  key: string;
  /** Payload text or the humanized event type. */
  title: string;
  /** Payload's friendly one-liner, when it carries one. */
  message: string | null;
  /**
   * ISO 8601, UTC — same field name as every other card kind carries, so
   * `mergeNotificationCards` sorts all three kinds by it unchanged.
   */
  latestCreatedAt: string;
  isUnread: boolean;
}

/**
 * One attendance notification's card (Story 15-10; 19-4 opens it to BOTH
 * roles) — one row = one card, same contract as generic cards PLUS a tap
 * the screen guards: `attendance-guarded` navigates only when the access
 * seam says the Attendance tab exists; `dashboard` lands the owner on the
 * AttendanceDashboard (the reminder summary's home).
 */
export type AttendanceCardTap = 'attendance-guarded' | 'dashboard';

export interface AttendanceNotificationCardData {
  kind: 'attendance';
  /** The notification row's id — the FlatList key. */
  key: string;
  /** Composed copy — e.g. "Holiday added" / "Check-in reminder". */
  title: string;
  message: string | null;
  /** The card's tap target (the screen owns the actual navigation). */
  tap: AttendanceCardTap;
  latestCreatedAt: string;
  isUnread: boolean;
  unreadIds: string[];
}

/** Composed copy per shipped attendance event; unknown sub-types humanize. */
const ATTENDANCE_EVENT_TITLES: Record<string, string> = {
  'attendance.holiday_added': 'Holiday added',
  'attendance.holiday_removed': 'Holiday removed',
  'attendance.reminder_checkin': 'Check-in reminder',
  'attendance.reminder_checkout': 'Check-out reminder',
  'attendance.reminder_not_checked_in': 'Not checked in',
};

/** The reminder personal copy (fixed — these cards speak to "you"). */
const CHECKIN_MESSAGE = "You haven't checked in yet today.";
const CHECKOUT_MESSAGE = "You haven't checked out yet today.";

/** `reminder_not_checked_in`'s message — the owner's office summary;
 *  singular/plural on the count ("1 hasn't checked in at «office».").
 *  A count of 0 is nonsense copy ("0 haven't checked in") — that instant
 *  means nobody is left to warn, so it is DRIFT, not a card: < 1 → null
 *  (honest minimal card). */
function notCheckedInMessage(payload: Record<string, unknown>): string | null {
  const count = payload.notCheckedInCount;
  const office = isText(payload.officeName) ? payload.officeName : null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    return null;
  }
  if (office === null) return null;
  const who = count === 1 ? "1 hasn't" : `${count} haven't`;
  return `${who} checked in at ${office}.`;
}

/** Builds one card per attendance row, preserving the list's newest-first
 *  order — for BOTH roles now (the classifier is the filter). A drifted
 *  payload degrades to an honest minimal card, never a crash. */
export function buildAttendanceCards(
  items: ApiNotification[],
  role: SessionRole,
): AttendanceNotificationCardData[] {
  return items
    .filter(n => notificationEventAction(n, role) === 'attendance')
    .map(n => {
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      const isReminder = isAttendanceReminderEvent(n.eventType);
      let message: string | null = null;
      if (n.eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKIN) {
        message = CHECKIN_MESSAGE;
      } else if (n.eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKOUT) {
        message = CHECKOUT_MESSAGE;
      } else if (
        n.eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN
      ) {
        message = notCheckedInMessage(payload);
      } else {
        const holidayName = isText(payload.holidayName) ? payload.holidayName : null;
        const holidayDate =
          isText(payload.holidayDate) && payload.holidayDate.length >= 10
            ? formatLongDate(payload.holidayDate.slice(0, 10))
            : null;
        const parts = [holidayName, holidayDate].filter(
          (v): v is string => v !== null,
        );
        message = parts.length > 0 ? parts.join(' — ') : null;
      }
      return {
        kind: 'attendance' as const,
        key: n.id,
        title: ATTENDANCE_EVENT_TITLES[n.eventType] ?? humanizeEventType(n.eventType),
        message,
        // The owner's summary card lands on the dashboard; every
        // attendance-tab card keeps the guarded seam tap.
        tap: (isReminder && n.eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN
          ? 'dashboard'
          : 'attendance-guarded') as AttendanceCardTap,
        latestCreatedAt: n.createdAt,
        isUnread: n.readAt === null,
        unreadIds: n.readAt === null ? [n.id] : [],
      };
    });
}

/** Builds one card per generic row, preserving the list's newest-first order. */
export function buildGenericCards(items: ApiNotification[], role: SessionRole) {
  return items
    .filter(n => notificationEventAction(n, role) === 'generic')
    .map<GenericNotificationCardData>(n => {
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      return {
        kind: 'generic',
        key: n.id,
        title: isText(payload.title) ? payload.title : humanizeEventType(n.eventType),
        message: isText(payload.message) ? payload.message : null,
        latestCreatedAt: n.createdAt,
        isUnread: n.readAt === null,
      };
    });
}
