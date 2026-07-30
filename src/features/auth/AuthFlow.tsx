/**
 * AuthFlow — orchestrates first-time account setup: phone → otp → profile.
 *
 * Owns the shared state (number, code, business profile) and the current step,
 * and renders the matching screen. Step 1 (send OTP) is wired to the real
 * backend via `authApi.sendOtp`. Steps 2 (verify) and 3 (company setup) are
 * still stubbed behind TODOs — wire them the same way once those are ready.
 * On success it calls `onComplete`, and the app gate (useAuth) flips to
 * the main app.
 */
import { useCallback, useState } from 'react';
import { BUSINESS_TYPES, DIAL_CODE, OTP_LENGTH } from './constants';
import type { AuthResult, AuthStep, BusinessProfile } from './types';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { authApi } from '../../services';
import type { ApiError } from '../../services';

type Props = {
  onComplete: (result: AuthResult) => void;
};

const EMPTY_PROFILE: BusinessProfile = {
  businessName: '',
  ownerName: '',
  businessType: BUSINESS_TYPES[0],
  city: '',
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
      // TODO(authApi): const res = await authApi.verifyOtp({ otpSessionId, otpCode: code })
      // On success: persist res.token via setAuthToken, then branch on
      // res.user.tenantId — null means route to 'profile' (company setup),
      // otherwise this owner/technician already has a company; call
      // onComplete directly instead of showing the profile step.
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500)); // simulate network
      const ok = true; // mock: accept any complete 6-digit code for now
      if (ok) {
        setStep('profile');
      } else {
        setOtpError('That code is incorrect. Try again.');
        setCode('');
      }
    } finally {
      setVerifying(false);
    }
  }, [code, verifying]);

  // --- Step 3: finish setup --------------------------------------------
  const finish = useCallback(async () => {
    setSubmitting(true);
    try {
      // TODO(authApi): await authApi.setupCompany({ companyName, stateCode, ... })
      // On success: persist the NEW token (replaces the step-2 token) via
      // setAuthToken before calling onComplete — see docs/auth doc's
      // "Token behavior" section for why the old token must be discarded.
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500)); // simulate network
      onComplete({ phone: `${DIAL_CODE}${phone}`, profile });
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
    />
  );
}

