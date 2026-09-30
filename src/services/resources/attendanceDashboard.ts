/**
 * services/resources/attendanceDashboard.ts
 * ─────────────────────────────────────────
 * The FR-24 owner dashboard read (Story 19-4 over the shipped 19-2 route —
 * contract source: spec-19-1-to-19-3 §D5 + fenzit-be
 * `src/attendance/dashboard-response.model.ts`). Plain function on the
 * shared `apiClient` (the attendanceDayStatus.ts shape).
 *
 *   fetchDashboard   GET /attendance/dashboard?officeId=   [owner]
 *
 * One round-trip serves the WHOLE screen: the five counts, both flag
 * strips AND (when the deployed BE includes the additive 19-4 field) the
 * office picker's per-office stats. No idempotency key (a read).
 *
 * Wire facts the FE relies on (19-2):
 *   - `date` echoes the tenant-local "today" the read ran under.
 *   - Unknown-but-well-formed officeId → 200 with zeros + empty flags (a
 *     filter is not an entity fetch — the FE renders zeros honestly and
 *     adds no existence check). Malformed officeId is a 422.
 *   - Flag rows are ordered by workDate asc, then name — the FE preserves
 *     wire order, never re-sorts.
 *
 * The normalizer is FAIL-CLOSED (the 18-3 fetch-level rule): one bad field
 * rejects the whole fetch. Five counts feed KPI tiles and flags drive the
 * strips — a partially-trusted envelope would render a confidently wrong
 * summary, which is exactly the misrepresentation this forbids.
 */
import { apiClient } from '../api/apiClient';

/** The five FR-24 questions — each a non-negative integer. */
export interface AttendanceDashboardCounts {
  tracked: number;
  checkedIn: number;
  notCheckedIn: number;
  late: number;
  onLeave: number;
}

/** One employee-day with a check-in and no checkout (past days included —
 *  a flag can exist with zero today-tracked employees; past-day truth). */
export interface CheckoutMissingRow {
  employeeId: string;
  employeeName: string;
  workDate: string;
  /** Nullable on the wire (the office may have been removed) — display-only. */
  officeName: string | null;
}

/** One employee-day with at least one fake-location attempt. */
export interface FakeLocationRow extends CheckoutMissingRow {
  /** How many attempts the day recorded (non-negative integer). */
  attemptCount: number;
}

/** One office of the picker registry with today's stats (the 19-4
 *  redesign) — every non-archived office, tracked/checkedIn over the FULL
 *  tenant scope (never the fetch's filter). OPTIONAL on the wire: the
 *  currently deployed BE predates it, so the FE treats absence as
 *  "no stats available" (null) rather than a failure — the filter sheet
 *  falls back to name-only rows, and nothing about this field is
 *  fabricated client-side. */
export interface DashboardOfficeStat {
  id: string;
  name: string;
  tracked: number;
  checkedIn: number;
}

/** The FR-24 envelope — fail-closed on every scalar. */
export interface AttendanceDashboardData {
  date: string;
  counts: AttendanceDashboardCounts;
  offices: DashboardOfficeStat[] | null;
  flags: {
    checkoutMissing: CheckoutMissingRow[];
    fakeLocationAttempt: FakeLocationRow[];
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const COUNT_FIELDS = [
  'tracked',
  'checkedIn',
  'notCheckedIn',
  'late',
  'onLeave',
] as const;

const fail = (detail: string): never => {
  throw new Error(`dashboard: ${detail}`);
};

/** A non-negative integer — the only shape a count may take. */
function nonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(`counts.${field} is not a non-negative integer ${JSON.stringify(value)}`);
  }
  return value as number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Whitelist-normalizes one flag row — a bogus workDate or a bare string
 *  employeeName throws with the rest of the fetch. */
function normalizeFlagRow(raw: unknown): CheckoutMissingRow {
  if (!isObject(raw)) {
    fail('a flags row is not an object');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.employeeId !== 'string' || record.employeeId.length === 0) {
    fail('a flags row is missing its employeeId');
  }
  if (typeof record.employeeName !== 'string' || record.employeeName.length === 0) {
    fail('a flags row is missing its employeeName');
  }
  if (typeof record.workDate !== 'string' || !ISO_DATE.test(record.workDate)) {
    fail(`a flags row has a malformed workDate ${JSON.stringify(record.workDate ?? null)}`);
  }
  if (
    record.officeName !== null &&
    (typeof record.officeName !== 'string' || record.officeName.length === 0)
  ) {
    fail('a flags row carries a malformed officeName');
  }
  return {
    employeeId: record.employeeId as string,
    employeeName: record.employeeName as string,
    workDate: record.workDate as string,
    officeName: record.officeName as string | null,
  };
}

/** The one field that separates a fake-location row from a checkout-missing
 *  one — validated HERE, not assumed. */
function normalizeFakeLocationRow(raw: unknown): FakeLocationRow {
  const row = normalizeFlagRow(raw) as FakeLocationRow;
  const record = raw as Record<string, unknown>;
  row.attemptCount = nonNegativeInt(record.attemptCount, 'flag row attemptCount');
  return row;
}

function normalizeFlags(raw: unknown): AttendanceDashboardData['flags'] {
  if (!isObject(raw)) {
    fail('`flags` is not an object');
  }
  const flags = raw as Record<string, unknown>;
  if (!Array.isArray(flags.checkoutMissing)) {
    fail('`flags.checkoutMissing` is not a list');
  }
  if (!Array.isArray(flags.fakeLocationAttempt)) {
    fail('`flags.fakeLocationAttempt` is not a list');
  }
  return {
    checkoutMissing: (flags.checkoutMissing as unknown[]).map(normalizeFlagRow),
    fakeLocationAttempt: (flags.fakeLocationAttempt as unknown[]).map(
      normalizeFakeLocationRow,
    ),
  };
}

/** The office picker's per-office stats — validated only when PRESENT
 *  (the older deployed BE omits `offices` entirely; absence is an older
 *  API version, not a malformed response). Present-but-malformed still
 *  fails closed, like every other field. */
function normalizeOffices(raw: unknown): DashboardOfficeStat[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    fail('`offices` is not a list');
  }
  return (raw as unknown[]).map(stat => {
    if (!isObject(stat)) {
      fail('an `offices` row is not an object');
    }
    const row = stat as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) {
      fail('an `offices` row is missing its id');
    }
    if (typeof row.name !== 'string' || row.name.length === 0) {
      fail('an `offices` row is missing its name');
    }
    return {
      id: row.id as string,
      name: row.name as string,
      tracked: nonNegativeInt(row.tracked, 'offices row tracked'),
      checkedIn: nonNegativeInt(row.checkedIn, 'offices row checkedIn'),
    };
  });
}

/** Fail-closed the whole envelope (fetch-level rule). */
export function normalizeDashboard(raw: unknown): AttendanceDashboardData {
  if (!isObject(raw)) {
    fail('the response is not an object');
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.date !== 'string' ||
    !ISO_DATE.test(record.date)
  ) {
    fail(`the date echo is missing or malformed ${JSON.stringify(record.date ?? null)}`);
  }
  if (!isObject(record.counts)) {
    fail('`counts` is not an object');
  }
  const counts = record.counts as Record<string, unknown>;
  return {
    date: record.date as string,
    counts: {
      tracked: nonNegativeInt(counts.tracked, 'tracked'),
      checkedIn: nonNegativeInt(counts.checkedIn, 'checkedIn'),
      notCheckedIn: nonNegativeInt(counts.notCheckedIn, 'notCheckedIn'),
      late: nonNegativeInt(counts.late, 'late'),
      onLeave: nonNegativeInt(counts.onLeave, 'onLeave'),
    },
    flags: normalizeFlags(record.flags),
    offices: normalizeOffices(record.offices),
  };
}

/** `GET /attendance/dashboard?officeId=` — the FR-24 today snapshot. The
 *  `officeId` param is appended only when the owner filtered by an office
 *  ("All offices"/first load is the bare route). The RAW id goes to
 *  apiClient — its serializer (paramsSerializer) percent-encodes the value
 *  exactly once, so the id must NOT be pre-encoded here (a UUID never
 *  changes either way, but a second encode would double the % escapes). */
export async function fetchDashboard(
  officeId?: string,
): Promise<AttendanceDashboardData> {
  const res = await apiClient.get<AttendanceDashboardData>(
    '/attendance/dashboard',
    officeId !== undefined ? { params: { officeId } } : undefined,
  );
  return normalizeDashboard(res.data);
}
