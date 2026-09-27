/**
 * holidayFormModel — pure form state + validation for HolidayFormSheet
 * (Story 15-6). Mirrors the officeFormModel shape (empty/fromExisting/
 * validate/hasErrors) so the same screen-side orchestration pattern
 * applies — and the sheet's Save gating reads from one source of truth.
 *
 * Date semantics (mirrors the BE 15-5 DTO):
 *   - YYYY-MM-DD strings everywhere.
 *   - Add mode: any valid calendar date, past included (FR-20's "incl.
 *     past" — the BE allows past dates and recomputes statuses on read,
 *     AD-10; the FE must not be stricter than the contract). The sheet
 *     defaults to today and past dates stay selectable.
 *   - Edit mode: date is read-only and shown as a label; only the name is
 *     editable (15-5 made the date immutable on PATCH to keep impact
 *     notifications clean).
 *
 * Name semantics: trimmed, non-empty after trim, length ≤ 80 (the BE DTO
 * ceiling).
 */
import type {
  CreateHolidayRequest,
  UpdateHolidayRequest,
} from '../../../services';

/** Mirror of `HOLIDAY_NAME_MAX` in `fenzit-be/src/attendance/dto/holiday.dto.ts`. */
export const HOLIDAY_NAME_MAX = 80;

/** YYYY-MM-DD validator. Cheap, regex-only — the BE has the real authority. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  // Disallow impossible calendar dates ("2026-02-30" etc.). Constructing
  // a Date and back-formatting catches the roll-over JS does silently.
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export interface HolidayFormState {
  /** YYYY-MM-DD. */
  date: string;
  /** Free-text name, trimmed before submit. */
  name: string;
}

export interface HolidayFormErrors {
  date?: string;
  name?: string;
}

/**
 * Empty state — `date` is the caller's responsibility (today in add mode,
 * the existing date in edit mode). The sheet sets it on mount.
 */
export function emptyHolidayForm(date: string): HolidayFormState {
  return { date, name: '' };
}

export function formFromHoliday(holiday: {
  date: string;
  name: string;
}): HolidayFormState {
  return { date: holiday.date, name: holiday.name };
}

/**
 * Client-side validation matching the BE 422 contract. An empty errors
 * object means the form is ready to submit.
 */
export function validateHolidayForm(form: HolidayFormState): HolidayFormErrors {
  const errors: HolidayFormErrors = {};
  if (!isValidDateString(form.date)) {
    errors.date = 'Pick a valid date.';
  }
  const trimmedName = form.name.trim();
  if (trimmedName.length === 0) {
    errors.name = 'Name is required.';
  } else if (trimmedName.length > HOLIDAY_NAME_MAX) {
    errors.name = `Name must be ${HOLIDAY_NAME_MAX} characters or fewer.`;
  }
  return errors;
}

export function hasHolidayFormErrors(errors: HolidayFormErrors): boolean {
  return Boolean(errors.date) || Boolean(errors.name);
}

/**
 * Build the POST/PATCH body — `name` trimmed, `date` only when mutable.
 * Overloaded on `isEdit` (15-6 review iteration 1): the call sites know the
 * mode statically, so the overloads remove the `as CreateHolidayRequest` /
 * `as UpdateHolidayRequest` casts the sheet used to need.
 */
export function buildHolidaySubmitBody(
  form: HolidayFormState,
  isEdit: true,
): UpdateHolidayRequest;
export function buildHolidaySubmitBody(
  form: HolidayFormState,
  isEdit: false,
): CreateHolidayRequest;
export function buildHolidaySubmitBody(
  form: HolidayFormState,
  isEdit: boolean,
): UpdateHolidayRequest | CreateHolidayRequest {
  if (isEdit) {
    return { name: form.name.trim() };
  }
  return { date: form.date, name: form.name.trim() };
}
