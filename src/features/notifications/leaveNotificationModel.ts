/**
 * leaveNotificationModel.ts — the leave notification cards (Story 17-6,
 * spec D5). The classifiers are ENUMERATED lists of exactly the 8 shipped
 * `leave.*` events (wire-truth F6), PLUS the 9th in Story 19-4:
 * `leave.pending_reminder` (owner recipient, payload `[pendingCount]`,
 * 19-1's BE emitter). It was OFF here until 19-4 ("deliberately on the
 * generic card" — see git history for that reasoning); the story adds it
 * with its OWN composed copy, so the original broken-copy concern no
 * longer applies — a drifted payload degrades to the minimal honest card
 * like every other enumerated event.
 *
 * Copy is FE-composed from payload DATA (never display text): single-day
 * spans collapse to one date, `reason` is ALWAYS present-but-nullable in
 * the `rejected`/`owner_revoked` payloads so the branch is on
 * `reason != null` (never key presence), `owner_revoked`'s dates come from
 * `revokedDates[]` (not the span), and every field degrades to null —
 * never a crash, never `undefined` on screen.
 */
import type { ApiNotification } from '../../services';
import {
  formatLeaveDate,
  formatLeaveRange,
  workingDaysCopy,
} from '../attendance/leave/leaveStatusModel';

/** The owner-facing events (recipient = tenants.owner_id, BE D14).
 *  Story 19-4 adds `leave.pending_reminder` (the FE half of 19-1's D3). */
export const LEAVE_OWNER_EVENTS = [
  'leave.applied',
  'leave.employee_cancelled',
  'leave.checkin_auto_cancel',
  'leave.pending_reminder',
] as const;

/** The employee-facing events. */
export const LEAVE_EMPLOYEE_EVENTS = [
  'leave.applied_on_behalf',
  'leave.approved',
  'leave.rejected',
  'leave.owner_revoked',
  'leave.cancelled_by_disable',
] as const;

export function isLeaveOwnerEvent(eventType: string): boolean {
  return (LEAVE_OWNER_EVENTS as readonly string[]).includes(eventType);
}

export function isLeaveEmployeeEvent(eventType: string): boolean {
  return (LEAVE_EMPLOYEE_EVENTS as readonly string[]).includes(eventType);
}

/** Lucide glyph names for the card — the screen maps them to components.
 *  19-4 adds Clock for the pending-reminder card. */
export type LeaveCardIconName =
  | 'CalendarOff'
  | 'CalendarX'
  | 'CheckCircle2'
  | 'XCircle'
  | 'Undo2'
  | 'Clock';

/** The card's tap target (the screen owns the actual navigation). */
export type LeaveCardTap = 'owner-pending' | 'owner-all' | 'attendance-guarded';

export interface LeaveNotificationCardData {
  kind: 'leave';
  /** The notification row's id — the FlatList key. */
  key: string;
  title: string;
  message: string | null;
  icon: LeaveCardIconName;
  tap: LeaveCardTap;
  latestCreatedAt: string;
  isUnread: boolean;
  unreadIds: string[];
}

const isText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** "{dates}" — a single-day span collapses to one date everywhere. */
function datesOf(payload: Record<string, unknown>): string | null {
  const start = payload.startDate;
  const end = payload.endDate;
  if (!isIsoDate(start)) return null;
  if (!isIsoDate(end) || end === start) return formatLeaveDate(start);
  return formatLeaveRange(start, end);
}

/** `owner_revoked`'s dates come from `revokedDates[]` — the actionable
 *  subset, never the span (spec D5). */
function revokedDatesOf(payload: Record<string, unknown>): string | null {
  const list = payload.revokedDates;
  if (!Array.isArray(list)) return null;
  const dates = list.filter(isIsoDate).map(formatLeaveDate);
  return dates.length > 0 ? dates.join(', ') : null;
}

/** The EXACT cancelled dates (`cancelledDates[]`) for the split-aware
 *  cancellation events — same wire discipline as `revokedDates[]`; falls
 *  back to null so the caller can degrade to the span (17-6 review P3). */
function cancelledDatesOf(payload: Record<string, unknown>): string | null {
  const list = payload.cancelledDates;
  if (!Array.isArray(list)) return null;
  const dates = list.filter(isIsoDate).map(formatLeaveDate);
  return dates.length > 0 ? dates.join(', ') : null;
}

function countOf(payload: Record<string, unknown>): string | null {
  return isCount(payload.workingDays) ? workingDaysCopy(payload.workingDays) : null;
}

/** "{dates} · {n} working days" — either half alone when the other drifts. */
function spanMessage(payload: Record<string, unknown>): string | null {
  const parts = [datesOf(payload), countOf(payload)].filter(
    (v): v is string => v !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * `leave.rejected` / `leave.owner_revoked`: the payload ALWAYS carries
 * `reason` (nullable — branch on `reason != null`, never on key presence).
 */
function reasonOf(payload: Record<string, unknown>): string | null {
  return payload.reason != null && isText(payload.reason) ? payload.reason : null;
}

interface LeaveEventCopy {
  title: string;
  message: string | null;
  icon: LeaveCardIconName;
  tap: LeaveCardTap;
}

/** The D5 table, one branch per enumerated event. */
function copyFor(eventType: string, payload: Record<string, unknown>): LeaveEventCopy | null {
  switch (eventType) {
    case 'leave.applied': {
      const who = isText(payload.employeeName) ? payload.employeeName : null;
      if (who === null) return null;
      return {
        title: `${who} applied for leave`,
        message: spanMessage(payload),
        icon: 'CalendarOff',
        tap: 'owner-pending',
      };
    }
    case 'leave.employee_cancelled': {
      const who = isText(payload.employeeName) ? payload.employeeName : null;
      if (who === null) return null;
      // No "partly cancelled" branch: the payload carries `cancelledDates[]`
      // but no span working-days, so partiness is underivable without
      // client-side span enumeration that weekly offs would corrupt (F2).
      // The DATES still come from `cancelledDates[]` when present — a split
      // cancel must not read as the whole span (review P3; wire truth).
      return {
        title: `${who} cancelled leave`,
        message: cancelledDatesOf(payload) ?? datesOf(payload),
        icon: 'CalendarX',
        tap: 'owner-all',
      };
    }
    case 'leave.checkin_auto_cancel': {
      const who = isText(payload.employeeName) ? payload.employeeName : null;
      if (who === null || !isIsoDate(payload.leaveDate)) return null;
      return {
        title: `${who} checked in on leave`,
        message: `Their leave on ${formatLeaveDate(payload.leaveDate)} was cancelled.`,
        icon: 'CalendarX',
        tap: 'owner-all',
      };
    }
    case 'leave.applied_on_behalf':
      return {
        title: 'Leave applied for you',
        message: spanMessage(payload),
        icon: 'CalendarOff',
        tap: 'attendance-guarded',
      };
    case 'leave.approved':
      return {
        title: 'Leave approved',
        message: spanMessage(payload),
        icon: 'CheckCircle2',
        tap: 'attendance-guarded',
      };
    case 'leave.rejected': {
      const dates = datesOf(payload);
      if (dates === null) return null;
      const reason = reasonOf(payload);
      return {
        title: 'Leave rejected',
        message: reason !== null ? `${dates} — "${reason}"` : dates,
        icon: 'XCircle',
        tap: 'attendance-guarded',
      };
    }
    case 'leave.owner_revoked': {
      const revoked = revokedDatesOf(payload);
      if (revoked === null) return null;
      const reason = reasonOf(payload);
      // One revoked day reads singular (review P3 grammar).
      const revokedCount = Array.isArray(payload.revokedDates)
        ? (payload.revokedDates as unknown[]).filter(isIsoDate).length
        : 0;
      const verb = revokedCount === 1 ? 'counts' : 'count';
      return {
        title: 'Leave revoked',
        message:
          reason !== null
            ? `${revoked} no longer ${verb} as leave — ${reason}`
            : `${revoked} no longer ${verb} as leave`,
        icon: 'Undo2',
        tap: 'attendance-guarded',
      };
    }
    case 'leave.cancelled_by_disable':
      return {
        title: 'Leave cancelled',
        message: cancelledDatesOf(payload) ?? datesOf(payload),
        icon: 'CalendarX',
        tap: 'attendance-guarded',
      };
    case 'leave.pending_reminder': {
      // 19-4 — the daily "n leave requests waiting" nudge lands on the
      // actionable queue (Pending), like leave.applied.
      const count = payload.pendingCount;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        return null;
      }
      return {
        title: 'Pending leave',
        message: `${count} leave request${count === 1 ? '' : 's'} waiting for approval.`,
        icon: 'Clock',
        tap: 'owner-pending',
      };
    }
    default:
      return null;
  }
}

/**
 * Builds one card per leave row for the signed-in role, preserving the
 * list's newest-first order. Only the ENUMERATED events enter here (the
 * filter IS the classifier) — an unknown `leave.*` type never builds a
 * card and renders generic. A drifted payload on a KNOWN event degrades
 * to the minimal honest card ("Leave updated", no message), never a
 * dropped row and never a crash.
 */
export function buildLeaveCards(
  items: ApiNotification[],
  role: 'owner' | 'technician',
): LeaveNotificationCardData[] {
  const matches =
    role === 'owner' ? isLeaveOwnerEvent : isLeaveEmployeeEvent;
  return items
    .filter(n => matches(n.eventType))
    .map(n => {
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      const copy = copyFor(n.eventType, payload);
      const title = copy?.title ?? 'Leave updated';
      return {
        kind: 'leave' as const,
        key: n.id,
        title,
        message: copy?.message ?? null,
        icon: copy?.icon ?? 'CalendarX',
        tap: copy?.tap ?? (role === 'owner' ? 'owner-all' : 'attendance-guarded'),
        latestCreatedAt: n.createdAt,
        isUnread: n.readAt === null,
        unreadIds: n.readAt === null ? [n.id] : [],
      };
    });
}
