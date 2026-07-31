/**
 * AddTechnicianSheet — bottom-sheet form to invite a technician (name +
 * phone + skills). Matches the Fenzit sheet pattern (rounded top, upward
 * shadow, grabber).
 *
 * Local form state (including the skill list fetch and the submit
 * loading/error state) lives here since it's tied directly to this form's
 * own UX — but persistence itself stays with the parent: `onSubmit` does the
 * actual API call and this sheet only reacts to whether that promise
 * resolves or rejects (close + reset vs. show the error and stay open).
 */
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, User } from 'lucide-react-native';
import { Button, Input, MultiSelect } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { skillService } from '../../../services';
import type { ApiError, Skill } from '../../../services';
import { DIAL_CODE, PHONE_LENGTH } from '../constants';
import type { NewTechnicianInput } from '../types';

/** API caps `skillIds` at 20 per invite — enforced client-side too so the multi-select can't collect a selection the backend will just reject. */
const MAX_SKILLS = 20;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Performs the actual invite API call. Rejects with `ApiError` on failure. */
  onSubmit: (input: NewTechnicianInput) => Promise<void>;
};

/** Turns a failed `invite` call into copy this sheet can show directly. */
function inviteErrorMessage(err: ApiError): string {
  if (err.code === 'DUPLICATE_RESOURCE') {
    return 'This phone number is already part of your team.';
  }
  if (err.code === 'VALIDATION_ERROR') {
    return 'Check the phone number and skills — one of them looks invalid.';
  }
  if (err.status === 403) {
    return "You don't have permission to invite technicians.";
  }
  return err.message;
}

export function AddTechnicianSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [skillsError, setSkillsError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Fetch the tenant's skill list fresh each time the sheet opens — the
  // multi-select can only offer skills that exist right now (from GET
  // /skills), it doesn't create new ones.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingSkills(true);
    setSkillsError('');
    skillService
      .list()
      .then(list => {
        if (!cancelled) setSkills(list);
      })
      .catch(err => {
        if (!cancelled) setSkillsError((err as ApiError).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingSkills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const canSubmit =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    skillIds.length > 0 &&
    skillIds.length <= MAX_SKILLS &&
    !submitting;

  const reset = () => {
    setName('');
    setPhone('');
    setSkillIds([]);
    setSubmitError('');
  };

  const handleClose = () => {
    // Don't let a backdrop tap or the Android back button dismiss the sheet
    // mid-request: the invite call is already in flight and can't be
    // cancelled, and closing now would let its eventual `catch` write
    // `submitError` into a sheet the user no longer sees, surfacing as a
    // stale error banner the next time they open it.
    if (submitting) return;
    reset();
    onClose();
  };

  const handlePhoneChange = (text: string) => {
    setSubmitError('');
    setPhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({ name: name.trim(), phone, skillIds });
      reset();
      onClose();
    } catch (err) {
      setSubmitError(inviteErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  };

  const skillOptions = skills.map(s => ({ value: s.id, label: s.name }));
  const skillsHelper =
    skillsError ||
    (!loadingSkills && skills.length === 0
      ? 'No skills set up yet — add one from Settings first.'
      : skillIds.length >= MAX_SKILLS
        ? `Maximum ${MAX_SKILLS} skills per technician.`
        : '');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />

            <Text style={styles.title}>Add technician</Text>
            <Text style={styles.subtitle}>
              They'll get an SMS invite to download the Fenzit app and come online.
            </Text>

            <View style={styles.form}>
              <Input
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Suresh Kumar"
                autoCapitalize="words"
                leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
              />
              <Input
                label="Phone number"
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                maxLength={PHONE_LENGTH}
                leadingIcon={
                  <View style={styles.dialRow}>
                    <Phone size={18} color={colors.textMuted} strokeWidth={2} />
                    <Text style={styles.dial}>{DIAL_CODE}</Text>
                  </View>
                }
              />
              <MultiSelect
                label="Skills"
                value={skillIds}
                onChange={setSkillIds}
                options={skillOptions}
                placeholder={loadingSkills ? 'Loading skills…' : 'Select skills'}
                helper={skillsHelper}
                disabled={loadingSkills || skills.length === 0}
              />
            </View>

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              onPress={handleSubmit}>
              {submitting ? 'Sending…' : 'Send invite'}
            </Button>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    gap: spacing.s4,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    marginBottom: spacing.s2,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: -spacing.s2,
  },
  form: {
    gap: spacing.s4,
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dial: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '700',
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
    marginTop: -spacing.s2,
  },
});
