/**
 * Step 3 — capture the business profile, then finish setup.
 * Composes Input + Select + Button from the Design System. GST is optional;
 * "Add later" finishes without it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Button, Input, Select } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { BUSINESS_TYPES } from '../constants';
import type { BusinessProfile } from '../types';

type Props = {
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onFinish: () => void;
  submitting?: boolean;
};

type Errors = Partial<Record<'businessName' | 'ownerName' | 'city', string>>;

export function ProfileScreen({ profile, onChange, onFinish, submitting = false }: Props) {
  const [errors, setErrors] = useState<Errors>({});

  const validate = (): boolean => {
    const next: Errors = {};
    if (!profile.businessName.trim()) next.businessName = 'Enter your business name.';
    if (!profile.ownerName.trim()) next.ownerName = 'Enter your name.';
    if (!profile.city.trim()) next.city = 'Enter your city.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finish = (skipGst: boolean) => {
    if (!validate()) return;
    if (skipGst) onChange({ gstNumber: '' });
    onFinish();
  };

  return (
    <AuthScaffold step={3}>
      <Text style={styles.eyebrow}>Step 3 of 3</Text>
      <Text style={styles.heading}>Tell us about your business</Text>

      <View style={styles.field}>
        <Input
          label="Business name"
          value={profile.businessName}
          onChangeText={t => {
            setErrors(e => ({ ...e, businessName: undefined }));
            onChange({ businessName: t });
          }}
          placeholder="e.g. Cool Air AC Services"
          autoCapitalize="words"
          error={errors.businessName}
        />
      </View>

      <View style={styles.field}>
        <Input
          label="Your name"
          value={profile.ownerName}
          onChangeText={t => {
            setErrors(e => ({ ...e, ownerName: undefined }));
            onChange({ ownerName: t });
          }}
          placeholder="e.g. Ravi Kumar"
          autoCapitalize="words"
          error={errors.ownerName}
        />
      </View>

      <View style={styles.field}>
        <Select
          label="Business type"
          value={profile.businessType}
          onChange={v => onChange({ businessType: v })}
          options={BUSINESS_TYPES as unknown as string[]}
          placeholder="Select your business type"
        />
      </View>

      <View style={styles.field}>
        <Input
          label="City"
          value={profile.city}
          onChangeText={t => {
            setErrors(e => ({ ...e, city: undefined }));
            onChange({ city: t });
          }}
          placeholder="e.g. Mumbai"
          autoCapitalize="words"
          error={errors.city}
        />
      </View>

      <View style={styles.field}>
        <Input
          label="GST number"
          value={profile.gstNumber}
          onChangeText={t => onChange({ gstNumber: t.toUpperCase() })}
          placeholder="27ABCDE1234F1Z5"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          helper="Optional — needed only for GST invoices"
        />
        <Pressable onPress={() => finish(true)} hitSlop={8} style={styles.addLater}>
          <Text style={styles.addLaterText}>Add later</Text>
        </Pressable>
      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={submitting}
        onPress={() => finish(false)}
        trailingIcon={
          submitting ? undefined : (
            <ArrowRight size={20} color={colors.onPrimary} strokeWidth={2.5} />
          )
        }
        style={styles.cta}>
        {submitting ? 'Setting up…' : 'Start using Fenzit'}
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
  field: {
    marginTop: spacing.s5,
  },
  addLater: {
    alignSelf: 'flex-start',
    marginTop: spacing.s2,
  },
  addLaterText: {
    ...typography.bodySm,
    color: colors.textLink,
    fontWeight: '600',
  },
  cta: {
    marginTop: spacing.s6,
  },
});
