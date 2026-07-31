/**
 * AuthFlow — orchestrates first-time account setup: phone → otp → profile.
 *
 * Owns the shared state (number, code, business profile) and the current step
 * and renders the matching screen. All three steps — send OTP, verify OTP,
 * and company setup — are wired to the real backend via `authApi`. On
 * success, it calls `onComplete`, and the app gate (useAuth) flips to the
 * main app.
 */
import { useCallback, useState } from 'react';
import { DIAL_CODE, OTP_LENGTH, SERVICE_CATEGORY_BY_BUSINESS_TYPE } from './constants';
import type { AuthResult, AuthStep, BusinessProfile } from './types';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { authApi, setAuthToken } from '../../services';
import type { ApiError } from '../../services';

type Props = {
  onComplete: (result: AuthResult) => void;
};

const EMPTY_PROFILE: BusinessProfile = {
  businessName: '',
  ownerName: '',
  businessTypes: [],
  city: '',
  stateCode: '',
  gstNumber: '',
};

/** Turns a failed `sendOtp` call into copy the phone/otp screens can show directly. */
function sendOtpErrorMessage(err: ApiError): string {

  if (err.code === 'VALIDATION_ERROR') {
    return 'That doesn\u2019t look like a valid mobile number.';
  }
  if (err.code === 'RATE_LIMIT_EXCEEDED') {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  return err.message;
}

/** Turns a failed `setupCompany` call into a copy the profile screen can show directly. */
function setupCompanyErrorMessage(err: ApiError): string {
  if (err.code === 'VALIDATION_ERROR') {
    return 'Check your GSTIN and state — one of them looks invalid.';
  }
  if (err.status === 403) {
    return "This account can't set up a company. Contact your business owner.";
  }
  return err.message;
}

/** Maps `businessTypes` labels to their service-category codes, per `SERVICE_CATEGORY_BY_BUSINESS_TYPE` — deduped in case two labels ever map to the same code. */
function serviceCategoriesFor(businessTypes: string[]): string[] {
  const codes = businessTypes.map(
    t => SERVICE_CATEGORY_BY_BUSINESS_TYPE[t as keyof typeof SERVICE_CATEGORY_BY_BUSINESS_TYPE] ?? 'other',
  );
  return [...new Set(codes)];
}

export default function AuthFlow({ onComplete }: Props) {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');

  const [code, setCode] = useState('');
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);

  // Returned by `sendOtp` — `otpSessionId` is what step 2 (verify) needs to
  // send back, per the backend contract (not the phone number).
  const [otpSessionId, setOtpSessionId] = useState('');

  // DEV ONLY: the backend includes the real OTP in the sendOtp response
  // while SMS delivery isn't wired up yet (see authApi.ts). Gated on __DEV__
  // here too, in addition to the backend's own plan to remove the field —
  // belt-and-braces so this can never render in a production build even if
  // a stray dev/staging response reaches one.
  const [devOtp, setDevOtp] = useState('');

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [profileError, setProfileError] = useState('');

  const changePhone = useCallback((digits: string) => {
    setPhone(digits);
    setPhoneError('');
  }, []);

  // --- Step 1: request an OTP -------------------------------------------
  const requestOtp = useCallback(async () => {
    const res = await authApi.sendOtp({ countryCode: DIAL_CODE, phoneNumber: phone });
    setOtpSessionId(res.otp_session_id);
    setDevOtp(__DEV__ && res.otp ? res.otp : '');
  }, [phone]);

  const sendOtp = useCallback(async () => {
    setSending(true);
    setCode('');
    setOtpError('');
    setPhoneError('');
    try {
      await requestOtp();
      setStep('otp');
    } catch (err) {
      setPhoneError(sendOtpErrorMessage(err as ApiError));
    } finally {
      setSending(false);
    }
  }, [requestOtp]);

  const resendOtp = useCallback(async () => {
    setCode('');
    setOtpError('');
    try {
      await requestOtp();
    } catch (err) {
      // Surface on the OTP screen — the person is already past step 1.
      setOtpError(sendOtpErrorMessage(err as ApiError));
    }
  }, [requestOtp]);

  // --- Step 2: verify the OTP -------------------------------------------
  const verifyOtp = useCallback(async () => {
    if (code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setOtpError('');
    try {
      const res = await authApi.verifyOtp({ otpSessionId, otpCode: code });
      setAuthToken(res.token);

      if (res.user.tenantId === null) {
        // New owner, first time through — company setup (step 3) is next.
        setStep('profile');
      } else {
        // Already has a tenant (returning owner, or a technician assigned
        // one at invite time) — nothing left to set up.
        onComplete({ phone: `${DIAL_CODE}${phone}`, profile });
      }
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.code === 'OTP_EXPIRED' || apiError.code === 'OTP_SESSION_LOCKED') {
        // Per the backend docs, the only recovery here is requesting a
        // fresh OTP — send the person back to step 1 rather than leaving
        // them stuck retrying a code that can never succeed.
        setCode('');
        setStep('phone');
        setDevOtp('');
        setPhoneError(
          apiError.code === 'OTP_SESSION_LOCKED'
            ? 'Too many incorrect attempts. Please request a new code.'
            : 'That code expired. Please request a new one.',
        );
        return;
      }

      if (apiError.code === 'INVALID_OTP') {
        setOtpError('That code is incorrect. Try again.');
        setCode('');
        return;
      }

      // VALIDATION_ERROR or anything else unexpected.
      setOtpError(apiError.message);
      setCode('');
    } finally {
      setVerifying(false);
    }
  }, [code, otpSessionId, phone, profile, onComplete, verifying]);

  // --- Step 3: finish setup ----------------------------------------------
  const finish = useCallback(async () => {
    // Belt-and-braces: the profile screen already requires at least one
    // business type before calling this, but guard here too in case that
    // validation is ever bypassed or this function is called from
    // somewhere else in the future.
    if (profile.businessTypes.length === 0) {
      setProfileError('Select at least one business type.');
      return;
    }

    setSubmitting(true);
    setProfileError('');
    try {
      const res = await authApi.setupCompany({


        companyName: profile.businessName,
        stateCode: profile.stateCode,
        gstin: profile.gstNumber || undefined,
        address: profile.city || undefined,
        serviceCategories: serviceCategoriesFor(profile.businessTypes),
      });
      // CRITICAL: this token replaces the one from verifyOtp — it now has
      // tenantId populated. The old one would keep failing tenant-scoped
      // endpoints. See the doc's "Token behavior" section.
      setAuthToken(res.token);
      onComplete({ phone: `${DIAL_CODE}${phone}`, profile });
    } catch (err) {
      setProfileError(setupCompanyErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  }, [phone, profile, onComplete]);

  const patchProfile = useCallback(
    (patch: Partial<BusinessProfile>) => setProfile(p => ({ ...p, ...patch })),
    [],
  );

  if (step === 'phone') {
    return (
      <PhoneScreen
        value={phone}
        onChangePhone={changePhone}
        onContinue={sendOtp}
        sending={sending}
        serverError={phoneError}
      />
    );
  }

  if (step === 'otp') {
    return (
      <OtpScreen
        phone={phone}
        code={code}
        onChangeCode={setCode}
        onVerify={verifyOtp}
        onResend={resendOtp}
        onChangeNumber={() => setStep('phone')}
        verifying={verifying}
        error={otpError}
        devOtp={devOtp}
      />
    );
  }

  return (
    <ProfileScreen
      profile={profile}
      onChange={patchProfile}
      onFinish={finish}
      submitting={submitting}
      serverError={profileError}
    />
  );
}
