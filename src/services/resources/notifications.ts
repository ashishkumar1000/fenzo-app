/**
 * services/resources/notifications.ts
 * ───────────────────────────────────
 * The owner's notifications: the newest-first paginated list (`GET
 * /notifications`), the unread badge count (`GET /notifications/unread-count`)
 * and the two read-state commands (`POST /notifications/mark-read`,
 * `POST /notifications/mark-all-read`) — Stories 3.1/3.2 (fenzit-be) own the
 * wire; this module mirrors it.
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `jobs.ts`). Every endpoint is recipient-scoped server-side by the JWT —
 * the client never sends a user id. Rejects with `ApiError` on failure.
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/**
 * One notification row, exactly as the API returns it (the backend's
 * `NotificationResponse`).
 *
 * `payload` is the self-sufficient JSONB the advance_workflow_step RPC wrote
 * (Story 3.1): `{ job_number, step, technician_name }` — rows render entirely
 * from it, never a per-row fetch. It is typed loosely (`Record<string,
 * unknown>`) on purpose: shape drift renders as fallback copy, it does not
 * crash (same unknown-value rule as the 3.3 banner model).
 */
export interface ApiNotification {
  /** uuid */
  id: string;
  /** uuid of the job the event happened on — the deep-link target. */
  jobId: string;
  /** Event type — today always the workflow step that fired it. */
  eventType: string;
  /** Denormalized display fields (`job_number`, `step`, `technician_name`). */
  payload: Record<string, unknown>;
  /** ISO 8601, UTC — null while unread. */
  readAt: string | null;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** Query accepted by `GET /notifications`. Omitted fields are simply not sent. */
export interface ListNotificationsQuery {
  /** Opaque cursor from the previous page — pass back verbatim. */
  cursor?: string;
  /** 1–50; server default 20. */
  limit?: number;
}

/**
 * `GET /notifications` — the signed-in recipient's rows, newest first
 * (`created_at DESC, id DESC` keyset). Empty history is a 200 with
 * `{ data: [], nextCursor: null, hasMore: false }` — not an error.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   400 bad cursor · 401 · 422 invalid limit/cursor
 */
async function list(query: ListNotificationsQuery = {}): Promise<Paginated<ApiNotification>> {
  const params: Record<string, unknown> = {};
  if (query.cursor) params.cursor = query.cursor;
  if (query.limit) params.limit = query.limit;
  const res = await apiClient.get<Paginated<ApiNotification>>('/notifications', { params });
  return res.data;
}

/**
 * `GET /notifications/unread-count` — rows with `read_at IS NULL` for the
 * signed-in recipient. The bell badge's only source.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   401
 */
async function unreadCount(): Promise<{ unreadCount: number }> {
  const res = await apiClient.get<{ unreadCount: number }>('/notifications/unread-count');
  return res.data;
}

/**
 * `POST /notifications/mark-read` — marks the given ids read (only the
 * recipient's own still-unread rows count). Idempotent: foreign, missing and
 * already-read ids are silent no-ops, so the response's `markedCount` may be
 * smaller than `ids.length`.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   401 · 422 empty array / malformed uuid / over 100 ids
 */
async function markRead(ids: string[]): Promise<{ markedCount: number }> {
  const res = await apiClient.post<{ markedCount: number }>('/notifications/mark-read', { ids });
  return res.data;
}

/**
 * `POST /notifications/mark-all-read` — marks every unread row of the
 * recipient read. Idempotent: a repeat with nothing left returns
 * `{ markedCount: 0 }`. Always sent — even when the local count looks stale
 * at 0 — so a missed live event can't leave unread rows stranded on screen.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   401
 */
async function markAllRead(): Promise<{ markedCount: number }> {
  const res = await apiClient.post<{ markedCount: number }>('/notifications/mark-all-read');
  return res.data;
}

export const notificationService = {
  list,
  unreadCount,
  markRead,
  markAllRead,
};
