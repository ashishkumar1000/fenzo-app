/**
 * AddSkillSheet — bottom-sheet form to add a skill (name only). Uses the DS
 * `Sheet` (native TrueSheet): the OS handles the keyboard, drag-to-dismiss,
 * and safe areas.
 *
 * Local form state lives here because it's tied to this form's own UX, but
 * persistence stays with the parent: `onSubmit` performs the `POST /skills`
 * call (the shared store's `addSkill`) and this sheet only reacts to whether
 * that promise resolves or rejects (close + reset vs. show the error and
 * stay open). The 409 duplicate gets friendlier copy than the wire message.
 */
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
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
  // Focused on did-present — TrueSheet discourages `autoFocus` (the keyboard
  // would appear before the native sheet finishes presenting).
  const inputRef = useRef<TextInput>(null);
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
    <Sheet
      visible={visible}
      onClose={handleClose}
      title="Add a skill"
      onDidPresent={() => inputRef.current?.focus()}>
      <Input
        ref={inputRef}
        label="Skill name"
        required
        value={name}
        onChangeText={handleNameChange}
        placeholder="e.g. AC repair"
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
