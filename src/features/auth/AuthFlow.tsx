/**
 * AuthFlow — orchestrates first-time account setup: phone → otp → profile.
 *
 * Owns the shared state (number, code, business profile) and the current step,
 * and renders the matching screen. The network calls are stubbed here behind
 * clear TODOs — wire them to `src/services/authService.ts` when the backend is
 * ready. On success it calls `onComplete`, and the app gate (useAuth) flips to
 * the main app.
 */
import { useCallback, useState } from 'react';
import { BUSINESS_TYPES, DIAL_CODE, OTP_LENGTH } from './constants';
import type { AuthResult, AuthStep, BusinessProfile } from './types';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';

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

export default function AuthFlow({ onComplete }: Props) {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');

  // --- Step 1: request an OTP -------------------------------------------
  const sendOtp = useCallback(async () => {
    setSending(true);
    setCode('');
    setOtpError('');
    try {
      // TODO(authService): await authService.requestOtp(`${DIAL_CODE}${phone}`)
      await new Promise(r => setTimeout(r, 500)); // simulate network
      setStep('otp');
    } finally {
      setSending(false);
    }
  }, [phone]);

  const resendOtp = useCallback(async () => {
    setCode('');
    setOtpError('');
    // TODO(authService): await authService.requestOtp(`${DIAL_CODE}${phone}`)
  }, []);

  // --- Step 2: verify the OTP -------------------------------------------
  const verifyOtp = useCallback(async () => {
    if (code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setOtpError('');
    try {
      // TODO(authService): const ok = await authService.verifyOtp(`${DIAL_CODE}${phone}`, code)
      await new Promise(r => setTimeout(r, 500)); // simulate network
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
  }, [code, phone, verifying]);

  // --- Step 3: finish setup --------------------------------------------
  const finish = useCallback(async () => {
    setSubmitting(true);
    try {
      // TODO(authService): await authService.completeSignup({ phone, profile })
      await new Promise(r => setTimeout(r, 500)); // simulate network
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
        onChangePhone={setPhone}
        onContinue={sendOtp}
        sending={sending}
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
