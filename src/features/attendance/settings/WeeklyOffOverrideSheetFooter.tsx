/**
 * WeeklyOffOverrideSheetFooter — the pinned footer of
 * `WeeklyOffOverrideSheet` (Story 15-6, FR-19): the inline save error, the
 * Save CTA and (edit mode) the destructive "Remove weekly off" action.
 *
 * The destructive button is disabled while a write is in flight, and the
 * parent additionally latches presses in a ref — `isSaving` is async state,
 * so a second tap in the window before re-render would otherwise slip past
 * a `disabled`-only guard (15-6 review P13, same fix HolidayFormSheet
 * already carries).
 *
 * Reports its measured height so the sheet body can pad its last row clear
 * of this footer (the native Sheet floats it above the scrolled content).
 *
 * Extracted from `WeeklyOffOverrideSheet.tsx` to keep that file under the
 * ~300-line file limit (15-6 review P17).
 */
import { StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import type { ApiError } from '../../../services';

export type WeeklyOffOverrideSheetFooterProps = {
  isEdit: boolean;
  isSaving: boolean;
  saveDisabled: boolean;
  saveError: ApiError | null;
  onSave: () => void;
  onRemove: () => void;
  /** Measured footer height — keeps the scrolled body clear of it. */
  onHeight: (height: number) => void;
};

export default function WeeklyOffOverrideSheetFooter({
  isEdit,
  isSaving,
  saveDisabled,
  saveError,
  onSave,
  onRemove,
  onHeight,
}: WeeklyOffOverrideSheetFooterProps) {
  return (
    <View style={styles.footer} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      {saveError && !isSaving ? (
        <InlineError
          message={saveError.message ?? "Couldn't save. Try again."}
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
          onPress={onRemove}
          disabled={isSaving}
          labelColor={colors.danger}
          leadingIcon={
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
          }
          fullWidth>
          Remove weekly off
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
