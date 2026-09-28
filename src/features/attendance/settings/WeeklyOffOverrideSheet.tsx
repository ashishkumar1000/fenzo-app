/**
 * WeeklyOffOverrideSheet — add or edit one per-employee weekly-off
 * override (Story 15-6, FR-19). Wired by WeeklyOffScreen. Two modes:
 *  - `add` — picks the employee via SelectTechniciansScreen (re-used
 *    as-is from the new-job picker, single-select with a sticky Apply).
 *  - `edit` — pre-fills from the existing `override`.
 *
 * Layout: same day pills + effective-date field as the tenant-default
 * block, plus a destructive "Remove weekly off" action (edit mode).
 *
 * Rules pinned by the 15-6 review:
 *  - Dirty baseline = the days the user was SHOWN on open (the override's
 *    current days in edit mode — empty included, since an existing
 *    works-all-week override shows no pills, not a fake Sunday; the visual
 *    Sunday preselect in add mode). The effective date seeds ONLY from
 *    the scheduled future edit (`override.next.validFrom`), mirroring the
 *    default screen's rule — never from the active rule's own start,
 *    which is typically in the past and would make the first Save a
 *    reschedule the BE silently clamps (AD-8). A date-only reschedule of
 *    a scheduled edit is therefore a dirty, saveable change.
 *  - Save gating is MODE-SPLIT (15-8's fix for the device-reported add-mode
 *    dead end): add mode saves on TOUCHED + valid (a set equal to the
 *    Sunday baseline is savable — see `isOverrideSaveDisabled`); edit mode
 *    stays dirty-vs-saved so a no-op toggle never re-PUTs.
 *  - An EMPTY day set is a valid save: the BE stores a works-all-week
 *    marker override (15-5's locked decision), so only the all-7-days
 *    rule (FR-18) blocks here. "Remove weekly off" is the separate "stop
 *    overriding" action and passes the sheet's effective date to the
 *    DELETE (`?effectiveFrom=`) — removal ends the override FROM that
 *    date; earlier override dates keep theirs (BE contract).
 *  - Save and Remove latch in refs; the destructive button disables
 *    while a write is in flight (double-submit guard).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { DatePickerField, InlineNotice, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type {
  ApiError,
  IsoWeekday,
  ProfileTechnician,
  SetWeeklyOffRequest,
  WeeklyOffOverrideResponse,
} from '../../../services';
import { WeeklyOffDayPicker } from './WeeklyOffDayPicker';
import WeeklyOffOverrideEmployeeField from './WeeklyOffOverrideEmployeeField';
import WeeklyOffOverrideSheetFooter from './WeeklyOffOverrideSheetFooter';
import { useOverrideRemove } from './useOverrideRemove';
import {
  isOverrideSaveDisabled,
  isWeeklyOffDirty,
  isValidIsoDate,
  SUNDAY,
} from './weeklyOffModel';

export type WeeklyOffOverrideSheetProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * Fired after a successful write, immediately BEFORE `onClose` — the
   * parent's cue for the transient success banner. `onClose` alone cannot
   * carry that meaning: the sheet is also dismissed by the Close button,
   * drag-down and Android back, and none of those are a write.
   */
  onSaved?: (kind: 'save' | 'delete') => void;
  today: string;
  employees: ProfileTechnician[];
  /** When set, edit mode (pre-fills + Remove). When undefined, add mode. */
  override?: WeeklyOffOverrideResponse;
  saveOverride: (
    employeeId: string,
    input: SetWeeklyOffRequest,
  ) => Promise<unknown>;
  removeOverride: (employeeId: string, effectiveFrom?: string) => Promise<void>;
  isSaving: boolean;
  saveError: ApiError | null;
  /** Open the new-job picker for the owner to pick an employee (add mode). */
  onPickEmployee: () => void;
  /** Currently picked employee id (add mode). undefined when not yet picked. */
  pickedEmployee?: ProfileTechnician;
};

export default function WeeklyOffOverrideSheet({
  visible,
  onClose,
  onSaved,
  today,
  employees,
  override,
  saveOverride,
  removeOverride,
  isSaving,
  saveError,
  onPickEmployee,
  pickedEmployee,
}: WeeklyOffOverrideSheetProps) {
  const isEdit = Boolean(override);
  const employeeId = override?.employeeId ?? pickedEmployee?.id;
  const employeeName =
    override?.employeeName ?? pickedEmployee?.name ?? 'this employee';

  // What the user is shown on open — the dirty baseline (see header).
  const baselineDays = useMemo<IsoWeekday[]>(
    () => (isEdit ? (override?.current?.days ?? []) : [SUNDAY]),
    [isEdit, override],
  );

  const [selectedDays, setSelectedDays] = useState<IsoWeekday[]>(baselineDays);
  const [effectiveFrom, setEffectiveFrom] = useState(
    override?.next?.validFrom ?? '',
  );
  const [hasTouched, setHasTouched] = useState(false);
  // The pinned footer floats above the scrolled body — measure it so the
  // ScrollView keeps its last row clear. Latches: double-submit guard.
  const [footerHeight, setFooterHeight] = useState(0);
  const footerClearance =
    footerHeight > 0 ? footerHeight + spacing.s32 : spacing.s32;
  const submitLatchRef = useRef(false);

  // Reset on every open, mode change AND picked-employee change (15-6
  // review iteration 1): the add sheet stays mounted while the owner swaps
  // the employee via "Change", and without the id in the deps the days
  // toggled for employee A would silently save against employee B.
  useEffect(() => {
    if (!visible) return;
    setSelectedDays(baselineDays);
    setEffectiveFrom(override?.next?.validFrom ?? '');
    setHasTouched(false);
  }, [visible, baselineDays, override, pickedEmployee?.id]);

  const workingDays = useMemo(
    () => [...selectedDays].sort((a, b) => a - b),
    [selectedDays],
  );
  const baselineSorted = useMemo(
    () => [...baselineDays].sort((a, b) => a - b),
    [baselineDays],
  );

  const sevenSelected = workingDays.length === 7;
  const noWorkingDays = workingDays.length === 0;
  // The native picker can only produce valid YYYY-MM-DD >= today (we pass
  // `minDate={today}`), but the value is also validated properly here —
  // "2026-02-31" matches the shape and is not a date (15-6 review P11).
  const dateValid =
    effectiveFrom === '' || isValidIsoDate(effectiveFrom);

  // The date counts toward dirty only against a seeded canonical (a
  // scheduled `next`); with nothing scheduled, a blank date IS the "today"
  // default, not a change — the default screen's rule, mirrored. The dirty
  // predicate is the model's (15-6 review iteration 1: the sheet used to
  // carry an inline copy of it).
  const effectiveCanonicalFrom = override?.next?.validFrom ?? null;
  const effectiveDateChanged =
    effectiveCanonicalFrom !== null &&
    effectiveFrom !== effectiveCanonicalFrom;

  const dirty = isWeeklyOffDirty({
    hasTouched,
    effectiveDateChanged,
    workingDays,
    canonicalDays: baselineSorted,
  });

  // The dirty predicate is the model's (15-6 review iteration 1: the sheet
  // used to carry an inline copy of it). Save gating is MODE-SPLIT (the
  // 15-8 add-mode fix, see `isOverrideSaveDisabled`): add mode saves on
  // touched + valid — a set equal to the Sunday baseline (the device-
  // reported dead end: a Sunday-only override was unsavable) now saves —
  // while edit mode keeps dirty-vs-saved so a no-op toggle never re-PUTs.
  const saveDisabled =
    !employeeId ||
    isOverrideSaveDisabled({
      isEdit,
      hasTouched,
      dirty,
      workingDays,
      dateValid,
      isSaving,
    });

  const onDayToggle = (next: IsoWeekday[]) => {
    setHasTouched(true);
    setSelectedDays(next);
  };

  const onSave = async () => {
    if (saveDisabled || !employeeId || submitLatchRef.current) return;
    submitLatchRef.current = true;
    try {
      await saveOverride(employeeId, {
        days: workingDays,
        effectiveFrom: effectiveFrom || undefined,
      });
      onSaved?.('save');
      onClose();
    } catch {
      // saveError surfaces inline; sheet stays open so the user can retry.
    } finally {
      submitLatchRef.current = false;
    }
  };

  // The destructive Remove flow (confirm + DELETE + latches) lives in its
  // own hook — see `useOverrideRemove.ts`.
  const onRemove = useOverrideRemove({
    override,
    effectiveFrom,
    removeOverride,
    isSaving,
    onSaved,
    onClose,
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit weekly off' : 'Set weekly off'}
      // Edit mode names the employee right in the chrome — previously only
      // the Remove alert said who was being edited (15-6 review iteration 1).
      subtitle={isEdit ? employeeName : undefined}
      // A 0.9 detent + scrollable body: the inline calendar is ~360px and
      // would otherwise squeeze behind the pinned footer.
      detents={[0.9]}
      scrollable
      footer={
        <WeeklyOffOverrideSheetFooter
          isEdit={isEdit}
          isSaving={isSaving}
          saveDisabled={saveDisabled}
          saveError={saveError}
          onSave={onSave}
          onRemove={onRemove}
          onHeight={setFooterHeight}
        />
      }>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: footerClearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {!isEdit ? (
          <WeeklyOffOverrideEmployeeField
            employees={employees}
            pickedEmployee={pickedEmployee}
            onPickEmployee={onPickEmployee}
          />
        ) : null}

        <Text style={styles.label}>Days off</Text>
        <WeeklyOffDayPicker
          value={selectedDays}
          onChange={onDayToggle}
          disabled={isSaving}
        />

        {sevenSelected ? (
          // The FR-18 rule as the same component the tenant-default block
          // uses (15-6 review iteration 1: the sheet rendered it as a bare
          // muted Text while the default block used InlineNotice).
          <InlineNotice
            tone="info"
            message="Pick at least one working day — a full week off isn't allowed."
          />
        ) : noWorkingDays ? (
          <Text style={styles.helper}>
            {`Pick at least one day off — or leave it empty if ${employeeName} works all 7 days.`}
          </Text>
        ) : null}

        <DatePickerField
          label="Effective from"
          value={effectiveFrom}
          today={today}
          minDate={today}
          onChange={(v) => {
            setHasTouched(true);
            setEffectiveFrom(v);
          }}
          placeholder={today}
          helper={
            effectiveFrom
              ? `Effective from ${effectiveFrom}`
              : `Effective from today (${today}) if you leave it blank`
          }
        />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s4,
  },
  label: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
