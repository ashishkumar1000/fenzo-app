/**
 * services/resources/users.ts
 * ────────────────────────────
 * The signed-in user's own profile (`/users/me`).
 *
 * Like `authApi.ts`, this is NOT built on `ApiService<T>` — `/users/me` is a
 * single "the current user" endpoint, not CRUD over a collection, so there's
 * no `list`/`getById` that makes sense here. Plain functions on the shared
 * `apiClient` instead.
 *
 * Note this endpoint is a *bootstrap* payload, not just identity: alongside
 * the user and their tenant it returns the technician roster and the first
 * page of customers and jobs, plus job counts by status. Home reads its
 * greeting and header stats from here rather than firing four requests.
 *
 * Requires the bearer token from `verifyOtp`/`setupCompany` — attached
 * automatically by apiClient's request interceptor. Rejects with `ApiError`
 * on failure, same contract as every other resource.
 */
import { apiClient } from '../api/apiClient';
import type { UserRole } from './authApi';
import type { ApiJob } from './jobs';

export type { Paginated } from '../api/pagination';
import type { Paginated } from '../api/pagination';

/**
 * The tenant as embedded in `/users/me` — the company-level fields only.
 * Deliberately not the `Tenant` type from `authApi.ts`: that one is the
 * `POST /auth/company` response and also carries `ownerId`, `createdAt` and
 * `updatedAt`, which this payload omits.
 */
export interface ProfileTenant {
  id: string;
  companyName: string;
  gstin: string | null;
  address: string | null;
  /** 2-letter uppercase ISO 3166-2:IN code, e.g. `KA`. */
  stateCode: string;
  serviceCategories: string[];
  /** UPI VPA for payments, e.g. `name@bank`. */
  upiVpa: string | null;
}

export type UserStatus = 'active' | 'inactive';

/**
 * Dashboard job counts, for the Home header stat tiles. Mirrors the backend's
 * `JobCounts` (fenzit-be Story 3-7): today/upcoming/overdue are mutually
 * exclusive IST day-buckets over active jobs, completed/cancelled are the
 * all-time totals — so their sum is every job in the account. There is no
 * plain per-status (scheduled/inProgress) breakdown in the payload.
 */
export interface JobCounts {
  today: number;
  upcoming: number;
  overdue: number;
  completed: number;
  cancelled: number;
}

/**
 * A technician on the owner's roster, as embedded in `/users/me`.
 *
 * These carry the *server's* technician ids — unlike the local
 * `useTechnicians` MMKV store, which fabricates `invite_<inviteId>` values.
 * Anything that sends a technician id to the backend (assigning a job) must
 * come from here.
 *
 * `skills` are the tenant's skill *names* (free text, created via
 * `POST /skills`), and `skillIds` the matching ids. The two arrays are
 * parallel.
 */
export interface ProfileTechnician {
  id: string;
  name: string;
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** Digits only, no country code. */
  phoneNumber: string;
  /**
   * Observed value: `invited`. Deliberately a plain string, not a union — the
   * backend has never published the full enum, and the technicians feature's
   * own `TechnicianStatus` (`active`/`offline`) disagrees with this one, so any
   * union written here would be a guess dressed up as a type.
   */
  status: string;
  /** Skill names, e.g. `['plumber']`. Free text — see `skills.ts`. */
  skills: string[];
  /** Ids for the same skills, in the same order. */
  skillIds: string[];
  /** ISO timestamp of when the technician was invited. */
  createdAt: string;
}

/**
 * The technician embedded on a profile job row (`/users/me` jobs.data[].technician`).
 * Same shape as `JobDetailTechnician`, but nullable-name: unlike the job-detail
 * endpoint (which 500s on a data anomaly), a profile row still renders with
 * `name: null` / empty strings when the mid-page lookup can't find the
 * technician — see fenzit-be Story 3-9 review notes.
 */
export interface ProfileTechnicianSummary {
  id: string;
  name: string | null;
  countryCode: string;
  phoneNumber: string;
  skills: string[];
}

/** The customer embedded on a profile job row. Same nullable-on-anomaly note as `ProfileTechnicianSummary`. */
export interface ProfileCustomerSummary {
  id: string;
  name: string | null;
  countryCode: string;
  phoneNumber: string;
  address: string | null;
  city: string | null;
}

/**
 * One `/users/me` job row: the plain `ApiJob` fields plus the technician and
 * customer embeds (fenzit-be Story 3-9) — always present (`technician_id` is
 * NOT NULL, so unassigned jobs cannot exist), never re-fetched by id on-device.
 */
export type ProfileJob = ApiJob & {
  technician: ProfileTechnicianSummary;
  customer: ProfileCustomerSummary;
};

export interface MyProfile {
  id: string;
  /**
   * Nullable to match the backend (`UserProfileBase.name: string | null`):
   * `POST /auth/company` never collects a name, so a fresh owner's profile
   * has `name: null` until Profile Edit saves one. Never assume a string.
   */
  name: string | null;
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** Digits only, no country code. */
  phoneNumber: string;
  status: UserStatus;
  tenant: ProfileTenant;
  role: UserRole;
  /**
   * The tenant's technician roster, with server-issued ids. `customers`/`jobs`
   * stay `unknown` until their shapes here are confirmed.
   */
  technicians: ProfileTechnician[];
  technicianCount: number;
  customers: Paginated<unknown>;
  jobs: Paginated<ProfileJob>;
  jobCounts: JobCounts;
}

/**
 * `GET /users/me` — requires auth. Returns the signed-in user's profile.
 *
 * `jobsScope` narrows `jobs` to today's exclusive IST window, sorted
 * `scheduledStart` ASC (fenzit-be Story 3-9). Omitting it sends no
 * `jobsScope` param at all — the byte-compatible default (`created_at DESC`,
 * no day filter). Passing `'all'` explicitly sends `?jobsScope=all` on the
 * wire rather than omitting the param; the backend treats both identically
 * (fenzit-be 3-9 AC 2), so there's no behavioural difference — just no
 * caller currently exercises `'all'` explicitly.
 */
async function getMe(signal?: AbortSignal, jobsScope?: 'today' | 'all'): Promise<MyProfile> {
  const params: Record<string, unknown> = {};
  if (jobsScope) params.jobsScope = jobsScope;
  const res = await apiClient.get<MyProfile>('/users/me', { signal, params });
  return res.data;
}

/**
 * `PATCH /users/me` — updates the signed-in user's display name. The server
 * trims and validates (`MinLength(1)`, `MaxLength(100)` → 422) and returns
 * the SAME full role-branched profile payload as `GET /users/me`, so callers
 * should treat the response exactly like a GET result and store it wholesale
 * (see `setProfileFromServer`) instead of refetching.
 */
async function updateMe(body: { name: string }): Promise<MyProfile> {
  const res = await apiClient.patch<MyProfile>('/users/me', body);
  return res.data;
}

export const usersApi = {
  getMe,
  updateMe,
};
