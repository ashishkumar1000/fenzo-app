/**
 * services/resources/authApi.ts
 * ───────────────────────────────
 * Auth onboarding — OTP send/verify and first-time company setup.
 *
 * Unlike `technicians.ts`, this is NOT built on `ApiService<T>` — these are
 * action endpoints (`send`, `verify`, `setupCompany`), not CRUD on a single
 * resource, so there's no `list`/`getById`/etc. that makes sense here.
 * Instead, this is a plain object of functions built directly on the shared
 * `apiClient`, one per endpoint documented in the backend's auth guide.
 *
 * Every function rejects with `ApiError` on failure (via apiClient's
 * response interceptor) — the same contract as `ApiService`, callers never see
 * a raw axios error.
 *
 * Currently implemented: `sendOtp`, `verifyOtp`, and `setupCompany`.
 */
import { apiClient } from '../api/apiClient';

// ── Send OTP ────────────────────────────────────────────────────────────────

export interface SendOtpRequest {
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** 6–15 digits, no country code, no spaces/dashes. */
  phoneNumber: string;
}

export interface SendOtpResponse {
  /** Opaque session id — pass this (not the phone number) to `verifyOtp` next. */
  otp_session_id: string;
  /** ISO timestamp — the OTP session expires 5 minutes after send. */
  expires_at: string;
  /**
   * ⚠️ Dev/testing only. The backend includes the real OTP here so testing
   * doesn't require SMS delivery — this field will be removed before
   * production. Do NOT read, display, or otherwise depend on this in any
   * app code; it's typed here only because it's present on the wire today.
   */
  otp?: string;
}

/** `POST /auth/otp/send` — no auth required. */
async function sendOtp(input: SendOtpRequest): Promise<SendOtpResponse> {
  const res = await apiClient.post<SendOtpResponse>('/auth/otp/send', input);
  return res.data;
}

// ── Verify OTP ───────────────────────────────────────────────────────────────

export interface VerifyOtpRequest {
  /** From `sendOtp`'s response — not the phone number. */
  otpSessionId: string;
  /** Exactly 6 digits. */
  otpCode: string;
}

export type UserRole = 'owner' | 'technician';

export interface VerifiedUser {
  userId: string;
  /**
   * `null` if this owner hasn't set up a company yet — route to company
   * setup (step 3) next. Already set for returning owners or for any
   * technician (always assigned a tenant by their owner at invite time).
   */
  tenantId: string | null;
  role: UserRole;
  /** `null` until set — owners currently have no name field; technicians get one at invite time. */
  name: string | null;
}

export interface VerifyOtpResponse {
  /** JWT — persist via `setAuthToken`; send as `Authorization: Bearer <token>` on subsequent requests. */
  token: string;
  user: VerifiedUser;
}

/** `POST /auth/otp/verify` — no auth required. */
async function verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  const res = await apiClient.post<VerifyOtpResponse>('/auth/otp/verify', input);
  return res.data;
}

// ── Company setup ────────────────────────────────────────────────────────────

export interface SetupCompanyRequest {
  /** The owner's display name — saved on their users row, shown on Home/More. */
  name: string;
  companyName: string;
  /** 2-letter uppercase ISO 3166-2:IN code, e.g. `KA`. */
  stateCode: string;
  /** Standard 15-char GSTIN, if provided. */
  gstin?: string;
  address?: string;
  /**
   * Seeds the company's initial skill list — only takes effect on the very
   * first successful call (when the tenant is created). Ignored by the
   * backend on subsequent calls; edit skills via the Skills API after that.
   */
  serviceCategories?: string[];
  /** UPI VPA for payments, e.g. `name@bank`. */
  upiVpa?: string;
}

export interface Tenant {
  id: string;
  ownerId: string;
  companyName: string;
  gstin: string | null;
  address: string | null;
  stateCode: string;
  serviceCategories: string[];
  upiVpa: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetupCompanyResponse {
  /**
   * ⚠️ CRITICAL: a NEW token, replacing the one from `verifyOtp` — it now
   * has `tenantId` populated. The old token will keep failing tenant-scoped
   * endpoints. Always persist this one via `setAuthToken` immediately.
   */
  token: string;
  tenant: Tenant;
}

/**
 * `POST /auth/company` — requires the token from `verifyOtp`. Owner role
 * only (technicians get 403). Idempotent: safe to call again later to
 * update company details.
 */
async function setupCompany(input: SetupCompanyRequest): Promise<SetupCompanyResponse> {
  const res = await apiClient.post<SetupCompanyResponse>('/auth/company', input);
  return res.data;
}

export const authApi = {
  sendOtp,
  verifyOtp,
  setupCompany,
};
