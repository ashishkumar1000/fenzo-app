/**
 * services/resources/attendanceMonthly.ts
 * ───────────────────────────────────────
 * The FR-25 owner monthly read (Story 19-5 over the shipped 19-3 route —
 * contract source: spec-19-1-to-19-3 §D6 + fenzit-be
 * `src/attendance/monthly-response.model.ts`). Plain function on the
 * shared `apiClient` (the attendanceDashboard.ts shape).
 *
 *   fetchMonthly   GET /attendance/monthly?from=&to=[&officeId=]  [owner]
 *
 * `from`/`to` are ALWAYS sent; `officeId` goes RAW in the params object —
 * apiClient's paramsSerializer percent-encodes the value exactly once, so
 * the id must NOT be pre-encoded here (the 19-4 double-encode lesson). No
 * idempotency key (a read). Request shaping (the window clamp) lives in
 * the feature's monthlyModel, not the screen.
 *
 * Wire facts the FE relies on (19-3):
 *   - `today` echoes the tenant-local clock the range check resolved
 *     (19-5's D2) — REQUIRED here, like the dashboard's `date` echo: the
 *     clamp is load-bearing request math, not display enrichment, and the
 *     cross-repo order (BE first) makes a missing `today` drift.
 *   - Rows include history-only/disabled employees with any tracked day
 *     in range (FR-28) — the FE never filters them.
 *   - `officeId`/`officeName` are nullable (an employee with no
 *     today-covering assignment) — display-only.
 *   - Unknown-but-well-formed officeId → 200 with ZERO rows (a filter is
 *     not an entity fetch — no FE existence check).
 *
 * The normalizer is FAIL-CLOSED (the 18-3 fetch-level rule): one bad field
 * rejects the whole fetch. Nine numbers feed the summary chips — a
 * partially-trusted row would render a confidently wrong month, which is
 * exactly the misrepresentation this forbids.
 */
import { apiClient } from '../api/apiClient';

/** The nine FR-25 summary answers — the wire's key set, verbatim. The six
 *  counts are non-negative integers; `daysWorked`/`leave`/
 *  `workedOnHoliday` are decimal-capable credits (17.5 is legal, FR-11). */
export interface MonthlyEmployeeSummary {
  daysWorked: number;
  halfDays: number;
  lateCount: number;
  leave: number;
  weeklyOffs: number;
  holidays: number;
  workedOnHoliday: number;
  absent: number;
  checkoutMissing: number;
}

/** One employee's row — the roster's CURRENT office pair (the assignment
 *  covering today) is nullable on the wire. */
export interface EmployeeMonthlyRow {
  employeeId: string;
  employeeName: string;
  officeId: string | null;
  officeName: string | null;
  summary: MonthlyEmployeeSummary;
}

/** The FR-25 envelope — fail-closed on every scalar. */
export interface AttendanceMonthlyData {
  from: string;
  to: string;
  today: string;
  employees: EmployeeMonthlyRow[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The six integer counts vs the three decimal credits. */
const INT_FIELDS = [
  'halfDays',
  'lateCount',
  'weeklyOffs',
  'holidays',
  'absent',
  'checkoutMissing',
] as const;

const DECIMAL_FIELDS = ['daysWorked', 'leave', 'workedOnHoliday'] as const;

const fail = (detail: string): never => {
  throw new Error(`monthly: ${detail}`);
};

/** A non-negative integer — the only shape a count may take. */
function nonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(`summary.${field} is not a non-negative integer ${JSON.stringify(value)}`);
  }
  return value as number;
}

/** A non-negative finite number — the decimal credit shape (17.5 legal). */
function nonNegativeDecimal(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    fail(`summary.${field} is not a non-negative finite number ${JSON.stringify(value)}`);
  }
  return value as number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `YYYY-MM-DD` regex check — the wire's only date vocabulary. */
function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    fail(`the ${field} echo is missing or malformed ${JSON.stringify(value ?? null)}`);
  }
  return value as string;
}

/** Whitelist-normalizes one summary — a missing key or a fractional count
 *  throws with the rest of the fetch. */
function normalizeSummary(raw: unknown): MonthlyEmployeeSummary {
  if (!isObject(raw)) {
    fail('a summary is not an object');
  }
  const record = raw as Record<string, unknown>;
  const summary = {} as MonthlyEmployeeSummary;
  for (const field of INT_FIELDS) {
    summary[field] = nonNegativeInt(record[field], field);
  }
  for (const field of DECIMAL_FIELDS) {
    summary[field] = nonNegativeDecimal(record[field], field);
  }
  return summary;
}

/** Whitelist-normalizes one employee row — a bogus id/name pair throws
 *  with the rest of the fetch. */
function normalizeEmployeeRow(raw: unknown): EmployeeMonthlyRow {
  if (!isObject(raw)) {
    fail('an employees row is not an object');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.employeeId !== 'string' || record.employeeId.length === 0) {
    fail('an employees row is missing its employeeId');
  }
  if (typeof record.employeeName !== 'string' || record.employeeName.length === 0) {
    fail('an employees row is missing its employeeName');
  }
  if (
    record.officeId !== null &&
    (typeof record.officeId !== 'string' || record.officeId.length === 0)
  ) {
    fail('an employees row carries a malformed officeId');
  }
  if (
    record.officeName !== null &&
    (typeof record.officeName !== 'string' || record.officeName.length === 0)
  ) {
    fail('an employees row carries a malformed officeName');
  }
  return {
    employeeId: record.employeeId as string,
    employeeName: record.employeeName as string,
    officeId: record.officeId as string | null,
    officeName: record.officeName as string | null,
    summary: normalizeSummary(record.summary),
  };
}

/** Fail-closed the whole envelope (fetch-level rule). */
export function normalizeMonthly(raw: unknown): AttendanceMonthlyData {
  if (!isObject(raw)) {
    fail('the response is not an object');
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.employees)) {
    fail('`employees` is not a list');
  }
  return {
    from: isoDate(record.from, 'from'),
    to: isoDate(record.to, 'to'),
    today: isoDate(record.today, 'today'),
    employees: (record.employees as unknown[]).map(normalizeEmployeeRow),
  };
}

/** `GET /attendance/monthly?from=&to=[&officeId=]` — the FR-25 month
 *  summary. `from`/`to` are always sent; the RAW officeId joins the params
 *  object only when the owner filtered by an office ("All offices" is the
 *  bare two-param route). apiClient encodes the emitted URL exactly once. */
export async function fetchMonthly(
  from: string,
  to: string,
  officeId?: string,
): Promise<AttendanceMonthlyData> {
  const params: { from: string; to: string; officeId?: string } = { from, to };
  if (officeId !== undefined) {
    params.officeId = officeId;
  }
  const res = await apiClient.get<AttendanceMonthlyData>(
    '/attendance/monthly',
    { params },
  );
  return normalizeMonthly(res.data);
}
