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
 * TODO: accept a `cursor` param and thread it through once the list needs
 * paging — the caller currently reads only the first page.
 */
async function list(): Promise<Paginated<ApiCustomer>> {
  const res = await apiClient.get<Paginated<ApiCustomer>>('/customers');
  return res.data;
}

export const customerService = {
  create,
  list,
};
