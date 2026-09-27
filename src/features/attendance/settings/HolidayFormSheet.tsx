/**
 * HolidayFormSheet — add or edit a holiday (Story 15-6, FR-20).
 *
 * Two modes:
 *  - Add: empty form, date defaults to today. Saves POST.
 *  - Edit: date is shown read-only (15-5 made it immutable on PATCH); only
 *    the name is editable. Saves PATCH.
 *
 * Impact preview: delegated to `HolidayImpactNotice` (300ms-debounced GET to
 * `/holidays/impact?date=` on every date change in add mode, latest-wins,
 * naming up to 3 affected employees plus "+{n-3} more employees'").
 *
 * Date-taken conflict: when POST returns 409 (ATTENDANCE_HOLIDAY_TAKEN or a
 * message containing "already exists"), the conflict is keyed to the date the
 * failed save was attempted for. It surfaces as a date-field error and blocks
 * Save only while the form still shows THAT date — picking a different date
 * clears it immediately (no re-save needed), and cycling back to the taken
 * date re-blocks it. The keying also means a 409 raised in one open of the
 * sheet can never brick a different open, or edit mode.
 *
 * Date floor: **none in add mode** — past dates are selectable, because
 * FR-20 asks for add/edit/remove "incl. past" and the BE's `CreateHolidayDto`
 * allows them ("Past dates allowed (statuses recompute on read)"). The Owner
 * who forgets a holiday, or learns a date after the fact, must be able to
 * record it; the FE must not be the thing that forbids it. The date is
 * immutable after creation (15-5 made PATCH name-only), so past holidays are
 * corrected by remove + re-add, which this floor would otherwise block.
 *
 * Double-submit guard: Save and Delete are disabled while `isSaving`, and a
 * ref latch covers the window between the button press and the parent
 * flipping `isSaving` — the fast double-tap that lands two POSTs for one
 * intended holiday (the BE would reject the second with a 409 the user never
 * meant to cause).
 *
 * Success reporting: a successful write fires `onSaved('save' | 'delete')`
 * before `onClose()`, so the screen can flash the right banner. `onClose`
 * fires on every dismissal path (Close button, drag-down, Android back)
 * and therefore never implies that anything was written.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { DatePickerField, Input, Sheet } from '../../../components/ui';
import { colors, typography } from '../../../theme';
import type {
  ApiError,
  CreateHolidayRequest,
  Holiday,
  HolidayImpactResponse,
  UpdateHolidayRequest,
} from '../../../services';
import HolidayImpactNotice from './HolidayImpactNotice';
import HolidayFormSheetFooter from './HolidayFormSheetFooter';
import {
  buildHolidaySubmitBody,
  emptyHolidayForm,
  formFromHoliday,
  hasHolidayFormErrors,
  validateHolidayForm,
  type HolidayFormErrors,
  type HolidayFormState,
  HOLIDAY_NAME_MAX,
} from './holidayFormModel';

export type HolidayFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * Fired after a successful write, immediately BEFORE `onClose` — the
   * parent's cue for the transient success banner. `onClose` alone cannot
   * carry that meaning: the sheet is also dismissed by the Close button,
   * drag-down and Android back, and none of those are a save.
   */
  onSaved?: (kind: 'save' | 'delete') => void;
  today: string;
  /** Existing holiday in edit mode; undefined in add mode. */
  holiday?: Holiday;
  create: (input: CreateHolidayRequest) => Promise<Holiday>;
  update: (id: string, patch: UpdateHolidayRequest) => Promise<Holiday>;
  remove: (id: string) => Promise<void>;
  impact: (date: string) => Promise<HolidayImpactResponse>;
  isSaving: boolean;
  saveError: ApiError | null;
};

/** The BE's 409 for a duplicate holiday date, however the client surfaces it. */
function isHolidayTakenError(err: ApiError | null): boolean {
  if (!err) return false;
  return (
    (typeof err.message === 'string' &&
      err.message.toLowerCase().includes('already exists')) ||
    (err.code ?? '').toString().toUpperCase() === 'ATTENDANCE_HOLIDAY_TAKEN'
  );
}

export default function HolidayFormSheet({
  visible,
  onClose,
  onSaved,
  today,
  holiday,
  create,
  update,
  remove,
  impact,
  isSaving,
  saveError,
}: HolidayFormSheetProps) {
  const isEdit = Boolean(holiday);
  const [form, setForm] = useState<HolidayFormState>(() =>
    holiday ? formFromHoliday(holiday) : emptyHolidayForm(today),
  );
  // The date the currently-tracked 409 was raised for, or null for none.
  const [conflictDate, setConflictDate] = useState<string | null>(null);
  // The saveError object already processed — each error object is keyed to a
  // conflict once, so re-running this effect (e.g. on a date change) can't
  // re-key a conflict against the new date.
  const seenConflictRef = useRef<ApiError | null>(null);
  // The date the in-flight (or last failed) save was attempted FOR, captured
  // at submit time (15-6 review): the form's date stays interactive while
  // the request is in the air, so keying off the live `form.date` could pin
  // date A's 409 onto date B — B blocked though free, A unflagged.
  const attemptedDateRef = useRef<string | null>(null);
  // Double-submit latches (see header) for Save and Delete.
  const submitLatchRef = useRef(false);
  const deleteLatchRef = useRef(false);

  // Reset on every open / mode change: a fresh open starts clean, so a
  // saveError the parent still holds from a previous attempt can't bleed in
  // (the parent additionally clears the hook's saveError on open — 15-6
  // review P3). `today` is deliberately NOT a dependency: the hook feeding
  // it exists precisely because the day can roll over mid-session, and the
  // reset re-running at IST midnight would wipe unsaved input on an open
  // sheet. A fresh OPEN remounts this sheet and seeds with the current day;
  // a midnight crossing while open must only move the pickers' floor, not
  // clear the form.
  useEffect(() => {
    if (!visible) return;
    setForm(holiday ? formFromHoliday(holiday) : emptyHolidayForm(today));
    setConflictDate(null);
    seenConflictRef.current = null;
    attemptedDateRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, holiday]);

  // Track the 409 against the date the save was attempted for — captured in
  // `onSubmit`, never the live form date (see `attemptedDateRef`).
  useEffect(() => {
    if (!visible || !saveError) return;
    if (seenConflictRef.current === saveError) return;
    seenConflictRef.current = saveError;
    if (!isEdit && isHolidayTakenError(saveError)) {
      setConflictDate(attemptedDateRef.current ?? form.date);
    }
  }, [visible, saveError, isEdit, form.date]);

  // Validate on every keystroke; an empty errors object = Save is enabled
  // (subject to the date-taken conflict below).
  const liveErrors = useMemo(() => validateHolidayForm(form), [form]);

  // Add mode only, and only while the form still shows the taken date —
  // picking a different date clears it, cycling back re-blocks.
  const dateConflict = !isEdit && conflictDate !== null && conflictDate === form.date;

  const allErrors: HolidayFormErrors = {
    ...liveErrors,
    ...(dateConflict && !liveErrors.date
      ? { date: 'A holiday already exists on this date.' }
      : {}),
  };
  const hasErrors = hasHolidayFormErrors(allErrors);

  // For edit mode the name must have changed AND be valid (date is
  // read-only — only the name field drives dirty).
  const isDirty = isEdit
    ? form.name.trim() !== (holiday?.name ?? '').trim()
    : true;

  const saveDisabled = !isDirty || hasErrors || isSaving;

  const onSubmit = async () => {
    if (saveDisabled || submitLatchRef.current) return;
    if (hasHolidayFormErrors(liveErrors)) return;
    attemptedDateRef.current = form.date;
    submitLatchRef.current = true;
    try {
      if (isEdit && holiday) {
        await update(holiday.id, buildHolidaySubmitBody(form, true));
      } else {
        await create(buildHolidaySubmitBody(form, false));
      }
      onSaved?.('save');
      onClose();
    } catch {
      // saveError surfaces inline; sheet stays open for retry.
    } finally {
      submitLatchRef.current = false;
    }
  };

  const onDelete = () => {
    if (!holiday || isSaving || deleteLatchRef.current) return;
    Alert.alert(
      'Delete holiday',
      `${holiday.name} (${holiday.date}) will be removed. Future dates notify tracked employees.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (deleteLatchRef.current) return;
            deleteLatchRef.current = true;
            try {
              await remove(holiday.id);
              onSaved?.('delete');
              onClose();
            } catch {
              // saveError surfaces inline.
            } finally {
              deleteLatchRef.current = false;
            }
          },
        },
      ],
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit holiday' : 'Add holiday'}
      subtitle={isEdit ? holiday?.date : undefined}
      footer={
        <HolidayFormSheetFooter
          isEdit={isEdit}
          isSaving={isSaving}
          saveDisabled={saveDisabled}
          saveError={saveError}
          onSave={onSubmit}
          onDelete={onDelete}
        />
      }>
      {isEdit ? (
        <Input
          label="Date"
          value={form.date}
          editable={false}
          placeholder={today}
          error={allErrors.date}
          helper="Date is immutable after creation."
        />
      ) : (
        <DatePickerField
          label="Date"
          value={form.date}
          today={today}
          // No `minDate`: past dates ARE selectable (FR-20's "incl. past",
          // and the BE allows them — statuses recompute on read, AD-10).
          // The date defaults to today; it is not floored to it.
          onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          placeholder={today}
          error={allErrors.date}
        />
      )}

      <Input
        label="Name"
        value={form.name}
        onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
        placeholder="e.g. Diwali"
        autoCapitalize="words"
        error={allErrors.name}
        // Raw length, matching what maxLength caps — trim() here would make
        // the counter disagree with the cap for names with trailing spaces.
        helper={`${form.name.length}/${HOLIDAY_NAME_MAX}`}
        maxLength={HOLIDAY_NAME_MAX}
      />

      <HolidayImpactNotice
        active={visible && !isEdit}
        date={form.date}
        dateError={liveErrors.date}
        impact={impact}
      />

      <Text style={styles.helper}>
        Holidays affect attendance for everyone — past dates can still be
        edited or removed.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
