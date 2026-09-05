/**
 * EditNameSheet — bottom-sheet form to edit the signed-in user's display
 * name (story 5.2). Chrome copied from `AddSkillSheet`: Modal with backdrop,
 * grabber, header row with a close button, KeyboardAvoidingView.
 *
 * Unlike the add-sheets, this one is self-contained: it calls `PATCH
 * /users/me` (`usersApi.updateMe`) and stores the response via
 * `setProfileFromServer` itself, because the PATCH response IS the fresh
 * profile — one request replaces the store, and every subscriber (Home
 * greeting, More account card, technician Profile) re-renders with no
 * refetch.
 *
 * Errors (422 validation, network) render inline and keep the sheet open.
 */
import { useEffect, useRef, useState } from 'react';
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
import { usersApi } from '../../../services';
import type { ApiError } from '../../../services';
import { setProfileFromServer } from '../useMyProfile';

type Props = {
  visible: boolean;
  /** The profile's current name — prefills the input and anchors "unchanged". */
  currentName: string | null;
  onClose: () => void;
};

/**
 * Turns a failed `PATCH /users/me` into copy this sheet can show directly.
 * `ApiError.message` is already a single string (NestJS ValidationPipe's
 * array form is joined centrally in `apiError.ts`), so a 422 just renders
 * the server's own copy.
 */
function createErrorMessage(err: ApiError): string {
  // Not every rejection is an `ApiError` (network TypeError, aborted
  // request) — fall back to generic copy so the banner never renders
  // `undefined`.
  return err?.message || 'Something went wrong. Try again.';
}

/** The API caps a name at 100 chars — enforced client-side too. */
const MAX_NAME_LENGTH = 100;

export function EditNameSheet({ visible, currentName, onClose }: Props) {
  const [name, setName] = useState(currentName ?? '');
  const [submitting, setSubmitting] = useState(false);
  // Same-frame double-tap guard: `submitting` (and the Button's `loading`)
  // only take effect on the next render, so two taps inside one frame would
  // both pass the `canSubmit` check.
  const inFlightRef = useRef(false);
  const [submitError, setSubmitError] = useState('');

  // Re-sync the draft on each OPEN transition: the profile may have changed
  // since the sheet last closed (or loaded after this sheet first mounted),
  // and a reopened sheet must not carry a stale draft or a stale error.
  // `openedRef` makes the mid-edit `currentName` dep a no-op, so a
  // profile-store update landing while the user is typing cannot wipe their
  // draft.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setName(currentName ?? '');
    setSubmitError('');
  }, [visible, currentName]);

  const trimmed = name.trim();
  // Disabled while unchanged (trim-normalized, like the server) or empty —
  // an empty name is invalid server-side (MinLength(1)) even when the
  // current name is also empty.
  const canSubmit =
    trimmed.length > 0 && trimmed !== (currentName ?? '') && !submitting;

  const handleClose = () => {
    // Don't let a backdrop tap, the X, or the Android back button dismiss the
    // sheet mid-request: the save is already in flight, and closing now would
    // let its eventual `catch` write into a sheet the user no longer sees.
    if (submitting) return;
    onClose();
  };

  const handleNameChange = (text: string) => {
    // Any edit clears a previous submit error — the user is most likely
    // fixing exactly what the server complained about (e.g. a 422), so a
    // stale error shouldn't sit under the form while they do.
    if (submitError) setSubmitError('');
    setName(text);
  };

  const handleSubmit = async () => {
    if (!canSubmit || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const profile = await usersApi.updateMe({ name: trimmed });
      // The PATCH response IS the fresh profile — store it wholesale rather
      // than refetching, then close.
      setProfileFromServer(profile);
      onClose();
    } catch (err) {
      setSubmitError(createErrorMessage(err as ApiError));
    } finally {
      inFlightRef.current = false;
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
                <Text style={styles.title}>Edit your name</Text>
              </View>

              <IconButton label="Close" size="sm" onPress={handleClose}>
                <X size={20} color={colors.textBody} strokeWidth={2} />
              </IconButton>
            </View>

            <Input
              label="Your name"
              required
              value={name}
              onChangeText={handleNameChange}
              placeholder="e.g. Ramesh Kumar"
              autoFocus
              maxLength={MAX_NAME_LENGTH}
            />

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              loading={submitting}
              onPress={handleSubmit}>
              Save
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
