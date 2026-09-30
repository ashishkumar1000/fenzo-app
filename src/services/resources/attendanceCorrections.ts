/**
 * services/resources/attendanceCorrections.ts
 * ───────────────────────────────────────────
 * The corrections history read (Story 18-3 D6 over the shipped 18-2
 * routes — contract source: fenzit-be `docs/api-contracts.md` →
 * "Day statuses & corrections"). The house `Paginated<CorrectionEntry>`
 * envelope (the exact reuse `attendanceLeave.ts` makes).
 *
 *   owner  GET /attendance/corrections      — `employeeId` required
 *   me     GET /attendance/me/corrections   — identity from the JWT
 *
 * Cursors are endpoint-scoped on the wire (`day-corrections-owner` /
 * `day-corrections-me`) and never replay across the two. Page bounds:
 * `limit` 1–50 (BE default 20); pages order newest first.
 *
 * Documented error mapping (the FE maps these, not the message text):
 *   - a missing/malformed `employeeId` (owner path) → 422 VALIDATION_ERROR
 *     (same treatment as the correction write routes);
 *   - a foreign-scope or malformed cursor → 400 VALIDATION_ERROR
 *     'Invalid cursor' — a deliberate NON-house 400 (house 4xx validation
 *     is 422), pinned here so callers branch on the code, never the shape;
 *   - `me` with access state none → 403 ATTENDANCE_NOT_TRACKED — an
 *     ordinary error state for the sheet (the access UI is 19-6's concern);
 *   - a foreign employee on the owner path → 404 (no existence leak).
 * The WRITE (Story 18-4 D6, `PUT /attendance/corrections/:employeeId/:workDate`)
 * adds these 422 subcodes to the same map — the FE branches on the code,
 * never the message text (which renders verbatim):
 *   - `VALIDATION_ERROR` — XOR shape broken (status+instants mixed,
 *     neither present, a checkout alone), a malformed employeeId/workDate,
 *     or note hygiene (trim, control chars, 1–500 after trim);
 *   - `ATTENDANCE_FUTURE_DATE` — workDate past the tenant's today;
 *   - `ATTENDANCE_DATE_NOT_TRACKED` — the day is not a tracked working day
 *     (the SAME engine predicate the row's `not_tracked` status renders);
 *   - `ATTENDANCE_INVALID_RANGE` — instants mis-anchored (checkout not
 *     strictly after check-in, or neither instant after the DB now).
 * There is NO idempotency key on the write (AD-6's letter): a replay is a
 * legitimate re-correction — which is why the FE latches presses instead.
 * All surface as `ApiError`; this module adds no retry/recovery policy.
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';
import { DAY_STATUS_LABELS, type DayStatusKey } from './attendanceDayStatus';
import { formatOffsetInstantTime } from '../../utils/offsetInstant';

/** The audit JSON value — exactly one of status XOR instants on the write
 *  path; a seeded old_value carries the day's FR-10 grade (any status key). */
export interface CorrectionValue {
  status: DayStatusKey | null;
  checkinAt: string | null;
  checkoutAt: string | null;
}

/** One history entry (owner or me, cursor-paginated, newest first). */
export interface CorrectionEntry {
  id: string;
  employeeId: string;
  workDate: string;
  /** AD-7 tenant-offset ISO — rendered verbatim (never converted). */
  correctedAt: string;
  /** null renders as "Owner" on the sheet (a system/unknown actor). */
  actorName: string | null;
  /** Why the value changed (required, 1-500 after trim). */
  note: string;
  oldValue: CorrectionValue;
  newValue: CorrectionValue;
}

export interface CorrectionsQuery {
  /** Owner path: the employee to read. Absent (with `me`) → the me path. */
  employeeId?: string;
  /** true → the technician's own history (identity from the JWT). */
  me?: boolean;
  /** Omit for the whole-account (owner) / whole-personal (me) history. */
  workDate?: string;
  cursor?: string;
  /** 1–50 (BE default 20); the sheet's first page uses 50. */
  limit?: number;
}

/**
 * `fetchCorrections` — routes on `me` vs `employeeId`; both answer the
 * same `Paginated<CorrectionEntry>` envelope.
 */
export async function fetchCorrections(
  query: CorrectionsQuery,
): Promise<Paginated<CorrectionEntry>> {
  const path = query.me
    ? '/attendance/me/corrections'
    : '/attendance/corrections';
  const params: Record<string, unknown> = {};
  if (!query.me && query.employeeId != null) params.employeeId = query.employeeId;
  if (query.workDate != null) params.workDate = query.workDate;
  if (query.cursor != null) params.cursor = query.cursor;
  if (query.limit != null) params.limit = query.limit;
  const res = await apiClient.get<Paginated<CorrectionEntry>>(path, { params });
  return res.data;
}

/**
 * Renders one audit value for the sheet's "{old} → {new}" line:
 *   a status word          → its DESIGN.md label ("Present");
 *   instants               → "Times 9:02 AM – 6:00 PM" (wall-clock parts
 *                            verbatim, 12-hour — the offsetInstant rules);
 *   nothing at all         → "—".
 */
export function formatCorrectionValue(value: CorrectionValue): string {
  if (value.status != null) {
    return DAY_STATUS_LABELS[value.status];
  }
  const times = [value.checkinAt, value.checkoutAt]
    .map(iso => formatOffsetInstantTime(iso))
    .filter((time): time is string => time != null);
  if (times.length > 0) {
    return `Times ${times.join(' – ')}`;
  }
  return '—';
}

/** The three statuses the write accepts (the wire's closed enum; every
 *  other DayStatusKey is an engine grade, never a correctable target). */
export type CorrectionStatus = 'present' | 'half_day' | 'absent';

/**
 * The XOR write body (18-4 D6): EXACTLY one arm travels — `{ status, note }`
 * or `{ checkinAt, checkoutAt?, note }`. Mixing the arms, sending neither,
 * or a checkout without a check-in is a `422 VALIDATION_ERROR` (the FE's
 * gates make all three unreachable; the type mirrors the wire so the
 * compiler carries the same rule). Both instants are full ISO WITH the
 * tenant offset — `${workDate}T${HH:mm}:00${carriedOffset}` (D2).
 */
export type CorrectionWriteBody =
  | { status: CorrectionStatus; note: string }
  | { checkinAt: string; checkoutAt?: string; note: string };

/** The `200` write echo (BE `PutCorrectionResponse`): the raw override —
 *  NOT the recomputed row (the FR-10 engine owns the displayed status), so
 *  the FE never seeds cells from it; it refreshes instead (D5). */
export interface CorrectionWriteResult {
  workDate: string;
  override: CorrectionValue;
  correctedAt: string;
  actorId: string;
}

/**
 * `correctDay` — the owner's day-correction write. Sends the XOR body
 * verbatim (no FE reshaping, no `X-Idempotency-Key`); the 200 echo comes
 * back as `CorrectionWriteResult`. Errors surface as `ApiError` per the
 * header map — the sheet renders the message verbatim.
 */
export async function correctDay(
  employeeId: string,
  workDate: string,
  body: CorrectionWriteBody,
): Promise<CorrectionWriteResult> {
  const res = await apiClient.put<CorrectionWriteResult>(
    `/attendance/corrections/${encodeURIComponent(employeeId)}/${encodeURIComponent(workDate)}`,
    body,
  );
  return res.data;
}
