/**
 * services/resources/customers.ts
 * ────────────────────────────────
 * Customers for the signed-in owner's tenant.
 *
 * `GET /customers/:id` exists now, but the collection still has no
 * update/delete contract, so this stays a plain function object on the shared
 * `apiClient` (same shape as `authApi`) rather than an `ApiService<T>`.
 * Promote it to `ApiService` once those endpoints exist.
 *
 * Owner-only: a technician JWT gets 403. Rejects with `ApiError` on failure.
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';
import type { JobServiceType, JobStatusApi } from './jobs';

export interface CreateCustomerRequest {
  name: string;
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** Digits only, no country code. */
  phoneNumber: string;
  address?: string;
  city?: string;
}

/**
 * The created customer, as returned by `201`. NOT a list row: the create
 * response (backend `CustomerResponse`) carries no derived `jobCount` /
 * `lastJobDate` — those come from `GET /customers` only. Callers that insert
 * the row straight into a list store must default them (a fresh customer has
 * no jobs), e.g. `upsertCustomer`.
 */
export type CreatedCustomer = Omit<ApiCustomer, 'jobCount' | 'lastJobDate'>;

/**
 * `POST /customers` — creates a customer for the owner's tenant.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   400 company not set up · 403 technician JWT ·
 *   409 duplicate phone number · 422 validation error
 */
async function create(input: CreateCustomerRequest): Promise<CreatedCustomer> {
  const res = await apiClient.post<CreatedCustomer>('/customers', input);
  return res.data;
}

/**
 * A customer as returned by `GET /customers`.
 *
 * Matches a real response. `address`, `city` and `lastJobDate` come back `null`
 * when unset. No lifetime value is returned.
 */
export interface ApiCustomer {
  id: string;
  name: string;
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** Digits only, no country code. */
  phoneNumber: string;
  /** Free-text address line, as sent on create. */
  address: string | null;
  city: string | null;
  jobCount: number;
  /** ISO timestamp of the most recent job, or `null` if they've had none. */
  lastJobDate: string | null;
}

/**
 * `GET /customers` — a page of the owner's customers.
 *
 * Returns the whole envelope, not just the rows: `hasMore`/`nextCursor` are
 * needed the moment a tenant has more customers than one page.
 *
 * ⚠️ ASSUMPTION: the cursor is sent as `?cursor=`. The response field is
 * `nextCursor` and the backend docs don't name the request param, so this is
 * inferred. If paging silently returns page 1 forever, this is the first thing
 * to check — `listAll` below is written to survive exactly that mistake rather
 * than loop indefinitely.
 */
async function list(cursor?: string): Promise<Paginated<ApiCustomer>> {
  const res = await apiClient.get<Paginated<ApiCustomer>>('/customers', {
    ...(cursor ? { params: { cursor } } : {}),
  });
  return res.data;
}

/** Hard ceiling on `listAll` requests — a backstop against a bad cursor. */
const MAX_PAGES = 20;

/**
 * One row of a customer's job history, from `GET /customers/:id`. Same wire
 * enums as the jobs endpoints — render via the jobs feature's `statusToBadge`
 * and `serviceTypeLabel`.
 */
export interface JobHistoryItem {
  id: string;
  jobNumber: string;
  scheduledStart: string;
  status: JobStatusApi;
  serviceType: JobServiceType;
}

/**
 * A customer's full profile plus their paginated job history, as returned by
 * `GET /customers/:id`. History is `scheduled_start DESC`, 20 per page,
 * keyset via `?cursor=` (`jobHistory.nextCursor` passed back verbatim).
 */
export interface CustomerDetail {
  id: string;
  name: string;
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** Digits only, no country code. */
  phoneNumber: string;
  address: string | null;
  city: string | null;
  createdVia: 'manual' | 'job_creation';
  createdAt: string;
  tenantId: string;
  jobHistory: Paginated<JobHistoryItem>;
}

/**
 * `GET /customers/:id` — one customer's profile and the first page of their
 * job history; pass `cursor` for the next page.
 *
 * Cursors are endpoint-scoped: a `GET /jobs` cursor is rejected with 400.
 * Documented failures, all surfaced as `ApiError`:
 *   400 malformed/foreign cursor · 403 technician JWT ·
 *   404 missing/cross-tenant customer
 */
async function getById(
  id: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const res = await apiClient.get<CustomerDetail>(`/customers/${id}`, {
    ...(cursor ? { params: { cursor } } : {}),
    ...(signal ? { signal } : {}),
  });
  return res.data;
}

/**
 * Every customer, following `nextCursor` until the server says there are no
 * more.
 *
 * A dropdown needs the complete list in a way a scrolling screen doesn't: a
 * customer missing from page one isn't just below the fold, they're
 * unselectable, and the owner gets no hint why.
 *
 * Two guards, both aimed at the assumption above being wrong. If the backend
 * ignores our cursor param it would keep returning page 1 with the same
 * `nextCursor` and `hasMore: true` forever, so an unchanged cursor stops the
 * loop; `MAX_PAGES` catches anything else. Both bail out with the rows
 * collected so far rather than throwing — a partial list beats no list.
 */
async function listAll(): Promise<ApiCustomer[]> {
  const rows: ApiCustomer[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const envelope = await list(cursor);
    rows.push(...envelope.data);

    if (!envelope.hasMore || !envelope.nextCursor) break;
    if (envelope.nextCursor === cursor) {
      console.warn(
        '[customerService.listAll] nextCursor did not advance — stopping. Is the cursor query param named something other than `cursor`?',
      );
      break;
    }
    cursor = envelope.nextCursor;
  }

  return rows;
}

export const customerService = {
  create,
  list,
  listAll,
  getById,
};
