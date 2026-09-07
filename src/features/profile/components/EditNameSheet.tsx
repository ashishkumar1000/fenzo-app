/**
 * EditNameSheet — bottom-sheet form to edit the signed-in user's display
 * name (story 5.2). Uses the DS `Sheet` (native TrueSheet): the OS handles
 * the keyboard, drag-to-dismiss, and safe areas.
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
import { StyleSheet, Text, TextInput } from 'react-native';
import { Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { usersApi } from '../../../services';
import type { ApiError } from '../../../services';
import { currentResetEpoch } from '../../../services/resetRegistry';
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
  // Focused on did-present — TrueSheet discourages `autoFocus` (the keyboard
  // would appear before the native sheet finishes presenting).
  const inputRef = useRef<TextInput>(null);
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
    // Capture the reset epoch before the await: a concurrent request's 401
    // can tear the session down while the PATCH is in flight. Writing the
    // previous session's response back into the just-cleared profile store
    // would repopulate it AND stamp `lastLoadedAt`, defeating the next
    // session's focus refresh (see services/resetRegistry.ts).
    const epochAtStart = currentResetEpoch();
    try {
      const profile = await usersApi.updateMe({ name: trimmed });
      if (currentResetEpoch() !== epochAtStart) return;
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
    <Sheet
      visible={visible}
      onClose={handleClose}
      // While the PATCH is in flight, drag-down and Android back are blocked
      // at the native level — `handleClose`'s veto alone fires too late (the
      // native sheet has already dismissed, leaving the parent stuck).
      dismissible={!submitting}
      title="Edit your name"
      onDidPresent={() => inputRef.current?.focus()}>
      <Input
        ref={inputRef}
        label="Your name"
        required
        value={name}
        onChangeText={handleNameChange}
        placeholder="e.g. Ramesh Kumar"
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
    marginTop: -spacing.s2,
  },
});
