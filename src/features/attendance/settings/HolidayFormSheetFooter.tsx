/**
 * HolidayFormSheetFooter — the pinned footer of `HolidayFormSheet`
 * (Story 15-6, FR-20): the inline save error, the Save CTA and (edit
 * mode) the destructive "Delete holiday" action.
 *
 * The destructive button is disabled while a write is in flight, and the
 * parent additionally latches presses in a ref — `isSaving` is async
 * state, so a second tap in the window before re-render would otherwise
 * slip past a `disabled`-only guard (15-6 review P13).
 *
 * Extracted from `HolidayFormSheet.tsx` to keep that file under the
 * ~300-line file limit (15-6 review P17).
 */
import { StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import type { ApiError } from '../../../services';

export type HolidayFormSheetFooterProps = {
  isEdit: boolean;
  isSaving: boolean;
  saveDisabled: boolean;
  saveError: ApiError | null;
  onSave: () => void;
  onDelete: () => void;
};

export default function HolidayFormSheetFooter({
  isEdit,
  isSaving,
  saveDisabled,
  saveError,
  onSave,
  onDelete,
}: HolidayFormSheetFooterProps) {
  return (
    <View style={styles.footer}>
      {saveError && !isSaving ? (
        <InlineError
          message={saveError.message || "Couldn't save. Try again."}
        />
      ) : null}
      <Button
        variant="primary"
        onPress={onSave}
        disabled={saveDisabled}
        loading={isSaving}
        fullWidth>
        Save
      </Button>
      {isEdit ? (
        <Button
          variant="ghost"
          onPress={onDelete}
          disabled={isSaving}
          labelColor={colors.danger}
          leadingIcon={
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
          }
          fullWidth>
          Delete holiday
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.s3,
  },
});
