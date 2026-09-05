/**
 * AddSkillSheet — bottom-sheet form to add a skill (name only). Chrome copied
 * from `AddCustomerSheet`: Modal with backdrop, grabber, header row with a
 * close button, KeyboardAvoidingView.
 *
 * Local form state lives here because it's tied to this form's own UX, but
 * persistence stays with the parent: `onSubmit` performs the `POST /skills`
 * call (the shared store's `addSkill`) and this sheet only reacts to whether
 * that promise resolves or rejects (close + reset vs. show the error and
 * stay open). The 409 duplicate gets friendlier copy than the wire message.
 */
import { useState } from 'react';
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
import { X } from 'lucide-react-native';
import { Button, IconButton, Input } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Performs the actual save. Rejects with `ApiError` on failure. */
  onSubmit: (name: string) => Promise<unknown>;
};

/** Turns a failed `POST /skills` into copy this sheet can show directly. */
function createErrorMessage(err: ApiError): string {
  if (err.status === 409 || err.code === 'DUPLICATE_RESOURCE') {
    return 'This skill already exists';
  }
  // Not every rejection is an `ApiError` (network TypeError, aborted
  // request) — fall back to generic copy so the banner never renders
  // `undefined`.
  return err?.message || 'Something went wrong. Try again.';
}

/** The API caps a skill name at 100 chars — enforced client-side too. */
const MAX_NAME_LENGTH = 100;

export function AddSkillSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const canSubmit = name.trim().length > 0 && !submitting;

  const reset = () => {
    setName('');
    setSubmitError('');
  };

  const handleClose = () => {
    // Don't let a backdrop tap, the X, or the Android back button dismiss the
    // sheet mid-request: the save is already in flight, and closing now would
    // let its eventual `catch` write into a sheet the user no longer sees.
    if (submitting) return;
    reset();
    onClose();
  };

  const handleNameChange = (text: string) => {
    // Any edit clears a previous submit error — the user is most likely
    // fixing exactly what the server complained about (e.g. a duplicate
    // name), so a stale 409 shouldn't sit under the form while they do.
    if (submitError) setSubmitError('');
    setName(text);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit(name.trim());
      reset();
      onClose();
    } catch (err) {
      setSubmitError(createErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  };

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

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Add a skill</Text>
              </View>

              <IconButton label="Close" size="sm" onPress={handleClose}>
                <X size={20} color={colors.textBody} strokeWidth={2} />
              </IconButton>
            </View>

            <Input
              label="Skill name"
              required
              value={name}
              onChangeText={handleNameChange}
              placeholder="e.g. AC repair"
              autoFocus
              maxLength={MAX_NAME_LENGTH}
            />

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              onPress={handleSubmit}>
              {submitting ? 'Saving…' : 'Add skill'}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
    marginTop: -spacing.s2,
  },
});
