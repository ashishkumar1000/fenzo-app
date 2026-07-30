/**
 * Step 2 — enter the OTP. Uses the autofill-ready OtpInput, a resend
 * countdown, and a "Change number" shortcut back to step 1.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { OtpInput } from '../components/OtpInput';
import { DIAL_CODE, OTP_LENGTH, RESEND_SECONDS } from '../constants';

type Props = {
  /** Local 10-digit mobile number, for the "Sent to" line. */
  phone: string;
  code: string;
  onChangeCode: (next: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onChangeNumber: () => void;
  verifying?: boolean;
  error?: string;
  /**
   * DEV ONLY — the real OTP, when the backend includes it (no SMS delivery
   * yet). Rendered only when `__DEV__` is true, so it can never show up in
   * a production build regardless of what a response contains.
   */
  devOtp?: string;
};

const formatPhone
 = (digits: string) =>
  `${DIAL_CODE} ${digits.replace(/(\d{5})(\d{5})/, '$1 $2')}`;

const mmss = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function OtpScreen({
  phone,
  code,
  onChangeCode,
  onVerify,
  onResend,
  onChangeNumber,
  verifying = false,
  error,
  devOtp,
}: Props) {
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setSeconds(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [startTimer]);

  const handleResend = () => {
    if (seconds > 0) return;
    onResend();
    startTimer();
  };

  const canResend = seconds === 0;
  const complete = code.length === OTP_LENGTH;

  return (
    <AuthScaffold step={2}>
      <Text style={styles.eyebrow}>Step 2 of 3</Text>
      <Text style={styles.heading}>Enter the code</Text>
      <Text style={styles.sub}>
        Sent to <Text style={styles.phone}>{formatPhone(phone)}</Text>
      </Text>

      <View style={styles.otp}>
        <OtpInput
          value={code}
          onChange={onChangeCode}
          length={OTP_LENGTH}
          error={Boolean(error)}
          onFilled={onVerify}
        />
      </View>

      {__DEV__ && devOtp ? (
        <Pressable onPress={() => onChangeCode(devOtp)} hitSlop={8} style={styles.devBanner}>
          <Text style={styles.devBannerText}>DEV — OTP is {devOtp} (tap to fill)</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.metaRow}>
        <Pressable onPress={handleResend} disabled={!canResend} hitSlop={8}>
          <Text style={[styles.resend, canResend ? styles.resendActive : null]}>
            {canResend ? 'Resend OTP' : `Resend OTP in ${mmss(seconds)}`}
          </Text>
        </Pressable>

        <Pressable onPress={onChangeNumber} hitSlop={8}>
          <Text style={styles.changeNumber}>Change number</Text>
        </Pressable>
      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!complete || verifying}
        onPress={onVerify}
        style={styles.cta}>
        {verifying ? 'Verifying…' : 'Verify & continue'}
      </Button>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  heading: {
    ...typography.title,
    color: colors.textStrong,
    marginTop: spacing.s2,
  },
  sub: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
  phone: {
    color: colors.textStrong,
    fontWeight: '700',
  },
  otp: {
    marginTop: spacing.s6,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s3,
  },
  devBanner: {
    marginTop: spacing.s3,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignSelf: 'flex-start',
  },
  devBannerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.s4,
  },
  resend: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  resendActive: {
    color: colors.textLink,
    fontWeight: '600',
  },
  changeNumber: {
    ...typography.bodySm,
    color: colors.textLink,
    fontWeight: '600',
  },
  cta: {
    marginTop: spacing.s6,
  },
});
