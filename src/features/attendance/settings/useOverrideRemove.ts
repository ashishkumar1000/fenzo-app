/**
 * useOverrideRemove — the destructive "Remove weekly off" confirm flow of
 * `WeeklyOffOverrideSheet` (Story 15-6, FR-19), extracted to keep the sheet
 * within the ~300-line file limit.
 *
 * Removal ends the override FROM the sheet's effective date (BE DELETE
 * `?effectiveFrom=`, default today) — a scheduled future edit can be
 * removed without clipping today's rule. Goes through the destructive
 * `Alert.alert` confirm; the destructive button only runs the DELETE, and
 * a ref latch covers the double-tap window (15-6 review P13).
 */
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import type { WeeklyOffOverrideResponse } from '../../../services';

export function useOverrideRemove({
  override,
  effectiveFrom,
  removeOverride,
  isSaving,
  onSaved,
  onClose,
}: {
  /** Edit mode only — undefined in add mode (nothing to remove). */
  override?: WeeklyOffOverrideResponse;
  /** The sheet's effective date ('' = today semantics). */
  effectiveFrom: string;
  removeOverride: (employeeId: string, effectiveFrom?: string) => Promise<void>;
  isSaving: boolean;
  onSaved?: (kind: 'save' | 'delete') => void;
  onClose: () => void;
}) {
  const removeLatchRef = useRef(false);

  const onRemove = useCallback(() => {
    if (!override || isSaving || removeLatchRef.current) return;
    const id = override.employeeId;
    const effective = effectiveFrom || undefined;
    Alert.alert(
      'Remove weekly off',
      effective
        ? `${override.employeeName} will follow the tenant default from ${effective}.`
        : `${override.employeeName} will follow the tenant default from today.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (removeLatchRef.current) return;
            removeLatchRef.current = true;
            try {
              await removeOverride(id, effective);
              onSaved?.('delete');
              onClose();
            } catch {
              // saveError surfaces inline.
            } finally {
              removeLatchRef.current = false;
            }
          },
        },
      ],
    );
  }, [override, isSaving, effectiveFrom, removeOverride, onSaved, onClose]);

  return onRemove;
}
