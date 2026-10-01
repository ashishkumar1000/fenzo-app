/**
 * useOverrideRemove — the destructive "Remove weekly off" confirm flow of
 * `WeeklyOffOverrideSheet` (Story 15-6, FR-19), extracted to keep the sheet
 * within the ~300-line file limit.
 *
 * Removal ends the override FROM the sheet's effective date (BE DELETE
 * `?effectiveFrom=`, default today) — a scheduled future edit can be
 * removed without clipping today's rule. The confirm moved to the shared
 * `ConfirmDialog` (the 20-1 modal ask): `onRemove` only OPENS the dialog
 * — the sheet renders it from the returned `removeOpen` state, with
 * `removeMessage` as the body — and `confirmRemove` runs the DELETE, with
 * a ref latch covering the double-tap window (15-6 review P13).
 *
 * The hook cannot render the dialog itself (it is hook-only), so the
 * open/close/confirm triple rides back to the sheet.
 */
import { useCallback, useRef, useState } from 'react';
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
  const [removeOpen, setRemoveOpen] = useState(false);

  // Composed from the sheet's state up-front so the dialog body is ready
  // the moment the destructive button opens it.
  const effective = effectiveFrom || undefined;
  const removeMessage = override
    ? effective
      ? `${override.employeeName} will follow the tenant default from ${effective}.`
      : `${override.employeeName} will follow the tenant default from today.`
    : '';

  const onRemove = useCallback(() => {
    if (!override || isSaving || removeLatchRef.current) return;
    setRemoveOpen(true);
  }, [override, isSaving]);

  const confirmRemove = useCallback(async () => {
    if (!override || removeLatchRef.current) return;
    setRemoveOpen(false);
    removeLatchRef.current = true;
    try {
      await removeOverride(override.employeeId, effectiveFrom || undefined);
      onSaved?.('delete');
      onClose();
    } catch {
      // saveError surfaces inline.
    } finally {
      removeLatchRef.current = false;
    }
  }, [override, effectiveFrom, removeOverride, onSaved, onClose]);

  const cancelRemove = useCallback(() => setRemoveOpen(false), []);

  return { onRemove, confirmRemove, cancelRemove, removeOpen, removeMessage };
}