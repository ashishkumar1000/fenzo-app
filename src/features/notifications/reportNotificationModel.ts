/**
 * reportNotificationModel.ts — pure card logic for Epic-12 report
 * notifications (`report_ready` / `report_failed`) on the Notifications
 * screen. No React, no network.
 *
 * The report engine (fenzit-be `report-notifications.ts`) inserts one
 * notification per terminal report status: `job_id` NULL (a report
 * notification points at a report, not a job) and a payload shape of
 * `{ reportId, reportType, reportLabel, status, errorCode }` — no job
 * fields at all. The job-status card pipeline (`notificationCardModel.ts`)
 * cannot render them: there is no jobId to group or deep-link on, so they
 * used to collapse into a dead "Job status updated / View Job" card. They
 * get their own card type here instead.
 *
 * Same unknown-value rule as every notifications model: payload drift
 * degrades to the fallback copy — never a crash, never `undefined` on
 * screen.
 */
import type { ApiNotification } from '../../services';
import type { StatusKey } from '../../theme';
import { failedReportCopy } from '../reports/reportModel';
import type { NotificationCardData } from './notificationCardModel';
import type { GenericNotificationCardData, SessionRole } from './notificationEventRegistry';

/** Event types the report worker writes (Epic 12). */
export const REPORT_READY_EVENT = 'report_ready';
export const REPORT_FAILED_EVENT = 'report_failed';

/** Generic title when the event type is somehow neither — never rendered today. */
const REPORT_FALLBACK_TITLE = 'Report update';

/**
 * The report worker's notification payload. All fields optional — shape
 * drift is handled, not trusted.
 */
export interface ReportEventPayload {
  reportId?: unknown;
  reportType?: unknown;
  reportLabel?: unknown;
  status?: unknown;
  errorCode?: unknown;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** True when the row is one of the report engine's terminal events. */
export function isReportNotification(n: ApiNotification): boolean {
  return n.eventType === REPORT_READY_EVENT || n.eventType === REPORT_FAILED_EVENT;
}

/**
 * One report notification's card. One notification row = one card (unlike
 * job cards, which group a job's whole event history): a report fires at
 * most one terminal event, so there is nothing to group. `key` is the
 * notification id — report cards have no jobId to key on.
 */
export interface ReportNotificationCardData {
  kind: 'report';
  /** The notification row's id — the FlatList key. */
  key: string;
  /** Report uuid from the payload; null on drift (the button still works). */
  reportId: string | null;
  /** Human label from the definition ("Technician Job Report"); null on drift. */
  reportLabel: string | null;
  /** True only for `report_failed` — picks the copy and the banner family. */
  isFailed: boolean;
  /** Card title: "Report ready" / "Report failed". */
  title: string;
  /** Friendly one-liner under the title. */
  message: string;
  /** Fenzit status family of the banner: done for ready, cancelled for failed. */
  statusKey: StatusKey;
  /** Banner label — the reports screen's own Badge vocabulary ("Ready"/"Failed"). */
  statusLabel: string;
  isUnread: boolean;
  unreadIds: string[];
  latestCreatedAt: string;
}

/** Everything the screen renders for one list row. */
export type NotificationListItem =
  | NotificationCardData
  | ReportNotificationCardData
  | GenericNotificationCardData;

/**
 * The tappable card kinds — the `NotificationCard` component's contract.
 * The registry's generic card (Story 14-3) is inert (no deep link, no tap),
 * so it is excluded here.
 */
export type TappableNotificationListItem = Exclude<
  NotificationListItem,
  { kind: 'generic' }
>;

/**
 * Builds one card per report notification, preserving the list's
 * newest-first order (the store's sort — untouched, same contract as
 * `groupNotificationsByJob`).
 *
 * `role` — Story 14-3: reports are an owner surface (AD-19/UX-DR7), so a
 * technician's report rows build NO report cards; the event-type registry
 * renders them generic instead. The parameter is REQUIRED (no silent
 * 'owner' default): a caller that omits the role is a bug, not a fallback.
 */
export function buildReportCards(
  items: ApiNotification[],
  role: SessionRole,
): ReportNotificationCardData[] {
  return role === 'technician' ? [] : items.filter(isReportNotification).map(buildReportCard);
}

function buildReportCard(n: ApiNotification): ReportNotificationCardData {
  const payload = (n.payload ?? {}) as ReportEventPayload;
  // The event type is authoritative (the worker picks it from the same
  // status it stamps); payload.status is carried in the payload but never
  // trusted over it.
  const isFailed = n.eventType === REPORT_FAILED_EVENT;

  const reportLabel = isText(payload.reportLabel) ? payload.reportLabel : null;
  const errorCode = isText(payload.errorCode) ? payload.errorCode : null;

  const title = isFailed ? 'Report failed' : n.eventType === REPORT_READY_EVENT ? 'Report ready' : REPORT_FALLBACK_TITLE;
  // The definition label already carries "Report" ("Technician Job Report").
  const message = isFailed
    ? failedReportCopy(errorCode)
    : reportLabel
      ? `${reportLabel} is ready to view.`
      : 'Your report is ready to view.';

  const unreadIds = n.readAt === null ? [n.id] : [];

  return {
    kind: 'report',
    key: n.id,
    reportId: isText(payload.reportId) ? payload.reportId : null,
    reportLabel,
    isFailed,
    title,
    message,
    statusKey: isFailed ? 'cancelled' : 'done',
    statusLabel: isFailed ? 'Failed' : 'Ready',
    isUnread: unreadIds.length > 0,
    unreadIds,
    latestCreatedAt: n.createdAt,
  };
}

/**
 * One FlatList out of three card kinds: job cards (the store's
 * newest-first first-appearance order), report cards (one per notification
 * row) and generic cards (Story 14-3's registry fallback, one per row —
 * unknown event types), interleaved by the card's newest event. A stable
 * sort keeps each side's own order intact — the job side's order already IS
 * "newest event first". `genericCards` is optional so the owner-only call
 * shape (job + report) keeps working unchanged.
 */
export function mergeNotificationCards(
  jobCards: NotificationCardData[],
  reportCards: ReportNotificationCardData[],
  genericCards: GenericNotificationCardData[] = [],
): NotificationListItem[] {
  return [...genericCards, ...reportCards, ...jobCards].sort(
    (a, b) => Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt),
  );
}
