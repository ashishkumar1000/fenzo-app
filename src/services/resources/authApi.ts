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
 * Currently implemented: `sendOtp` only. `verifyOtp` and `setupCompany` will
 * be added the same way once those steps are wired up.
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

export const authApi = {
  sendOtp,
};
