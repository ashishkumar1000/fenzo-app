/**
 * Step 3 — capture the business profile, then finish setup.
 * Composes Input + Select + MultiSelect + Button from the Design System.
 * GST is optional; "Add later" finishes without it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Button, Input, MultiSelect, Select } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { BUSINESS_TYPES, INDIA_STATES } from '../constants';
import type { BusinessProfile } from '../types';

/** Standard 15-char GSTIN format: 2-digit state code + 10-char PAN + entity code + 'Z' + checksum. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type Props = {
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onFinish: () => void;
  submitting?: boolean;
  /** Error from the `setupCompany` API call (e.g. invalid GSTIN) — distinct from local field validation below. */
  serverError?: string;
};

type Errors = Partial<
  Record<'businessName' | 'ownerName' | 'city' | 'stateCode' | 'businessTypes' | 'gstNumber', string>
>;

export function ProfileScreen({
  profile,
  onChange,
  onFinish,
  submitting = false,
  serverError = '',
}: Props) {
  const [errors, setErrors] = useState<Errors>({});

  const validate = (): boolean => {
    const next: Errors = {};
    if (!profile.businessName.trim()) next.businessName = 'Enter your business name.';
    if (!profile.ownerName.trim()) next.ownerName = 'Enter your name.';
    if (!profile.city.trim()) next.city = 'Enter your city.';
    if (!profile.stateCode.trim()) next.stateCode = 'Select your state.';
    if (profile.businessTypes.length === 0) next.businessTypes = 'Select at least one business type.';
    // GSTIN is optional (can be added later), but if provided, catch an
    // obviously malformed one locally instead of round-tripping to the
    // server just to find out.
    if (profile.gstNumber && !GSTIN_PATTERN.test(profile.gstNumber)) {
      next.gstNumber = 'That doesn\u2019t look like a valid GSTIN.';
    }
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
        <MultiSelect
          label="Business type"
          value={profile.businessTypes}
          onChange={v => {
            setErrors(e => ({ ...e, businessTypes: undefined }));
            onChange({ businessTypes: v });
          }}
          options={BUSINESS_TYPES as unknown as string[]}
          placeholder="Select your business type(s)"
        />
        {errors.businessTypes ? <Text style={styles.fieldError}>{errors.businessTypes}</Text> : null}
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
        <Select
          label="State"
          value={profile.stateCode}
          onChange={v => {
            setErrors(e => ({ ...e, stateCode: undefined }));
            onChange({ stateCode: v });
          }}
          options={INDIA_STATES as unknown as { value: string; label: string }[]}
          placeholder="Select your state"
        />
        {errors.stateCode ? <Text style={styles.fieldError}>{errors.stateCode}</Text> : null}
      </View>

      <View style={styles.field}>
        <Input
          label="GST number"
          value={profile.gstNumber}
          onChangeText={t => {
            setErrors(e => ({ ...e, gstNumber: undefined }));
            onChange({ gstNumber: t.toUpperCase() });
          }}
          placeholder="27ABCDE1234F1Z5"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          error={errors.gstNumber}
          helper="Optional — needed only for GST invoices"
        />
        <Pressable onPress={() => finish(true)} hitSlop={8} style={styles.addLater}>
          <Text style={styles.addLaterText}>Add later</Text>
        </Pressable>
      </View>

      {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

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
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s2,
  },
  serverError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s4,
  },
  cta: {
    marginTop: spacing.s6,
  },
});
