/**
 * services/resources/customers.ts
 * ────────────────────────────────
 * Customers for the signed-in owner's tenant.
 *
 * Only `POST /customers` and `GET /customers` exist so far, so this is a plain
 * function object on the shared `apiClient` (same shape as `authApi`) rather
 * than an `ApiService<T>` — there's no get-by-id/update/delete contract to
 * build on yet. Promote it to `ApiService` once those endpoints exist.
 *
 * Owner-only: a technician JWT gets 403. Rejects with `ApiError` on failure.
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

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
 * The created customer, as returned by `201`. Same shape as a list row.
 */
export type CreatedCustomer = ApiCustomer;

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
};
