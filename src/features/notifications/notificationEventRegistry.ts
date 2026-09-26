/**
 * notificationEventRegistry.ts — the frontend event-type registry
 * (Story 14-3, per AD-19 / UX-DR7). Keyed on the row's `eventType` (+
 * `jobId`), it decides each notification's card kind and, by way of the
 * card kind, its deep link and which UI it may touch. No React, no network.
 *
 * Three actions today:
 *   'job'     — a job-status event (eventType = a workflow step key, jobId
 *               set) → the grouped job card → JobDetail (owner) /
 *               TechJobDetail (technician).
 *   'report'  — the report engine's terminal events (Epic 12) → the report
 *               card → Reports. OWNER-only: reports are an owner surface,
 *               so a technician row of this type renders generic.
 *   'generic' — anything else, including event types this build has never
 *               seen (later attendance/leave epics). Renders a plain,
 *               non-tappable card and NEVER touches job UI.
 *
 * Rows written before Story 14-2 carry NULL entityType/entityId — they are
 * classified by eventType + jobId exactly as before, so owner job/report
 * behaviour is bit-identical to the pre-registry screen. New event families
 * (attendance/leave) plug in here without touching the bridge, the screen
 * or the job card pipeline.
 */
import type { ApiNotification } from '../../services';
import { isReportNotification } from './reportNotificationModel';

/** What a notification row renders as on the shared inbox. */
export type NotificationEventAction = 'job' | 'report' | 'generic';

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
  if (n.jobId !== null) return 'job';
  return 'generic';
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
