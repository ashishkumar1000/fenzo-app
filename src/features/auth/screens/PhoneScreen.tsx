/**
 * Step 1 — collect the mobile number and send an OTP.
 * Composes Input + Button from the Design System inside the shared scaffold.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Input } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { DIAL_CODE, OTP_LENGTH, PHONE_LENGTH } from '../constants';

type Props = {
  value: string;
  onChangePhone: (digits: string) => void;
  onContinue: () => void;
  sending?: boolean;
};

export function PhoneScreen({ value, onChangePhone, onContinue, sending = false }: Props) {
  const [error, setError] = useState('');

  const handleChange = (text: string) => {
    setError('');
    onChangePhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH));
  };

  const handleSubmit = () => {
    if (value.length !== PHONE_LENGTH) {
      setError(`Enter your ${PHONE_LENGTH}-digit mobile number.`);
      return;
    }
    onContinue();
  };

  return (
    <AuthScaffold step={1}>
      <Text style={styles.eyebrow}>Step 1 of 3</Text>
      <Text style={styles.heading}>Set up your account</Text>
      <Text style={styles.sub}>
        We'll send a {OTP_LENGTH}-digit code to this number.
      </Text>

      <View style={styles.field}>
        <Input
          label="Your mobile number"
          value={value}
          onChangeText={handleChange}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          maxLength={PHONE_LENGTH}
          error={error}
          leadingIcon={<Text style={styles.dial}>{DIAL_CODE}</Text>}
          style={{ marginBottom: spacing.s20 }}
        />
      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={sending}
        onPress={handleSubmit}
        style={styles.cta}>
        {sending ? 'Sending…' : 'Send OTP'}
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
  field: {
    marginTop: spacing.s6,
  },
  dial: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '700',
  },
  cta: {
    marginTop: spacing.s6,
  },
});
