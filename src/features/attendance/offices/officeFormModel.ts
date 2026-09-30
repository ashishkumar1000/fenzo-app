/**
 * officeFormModel — pure form state + validation for OfficeFormScreen
 * (Story 15-4). Ranges mirror the 15-3 DB CHECK constraints / DTO so a
 * 422 can never happen in practice: radius 50–1000, late cut-off 0–120,
 * full-day hours > 0, half-day hours > 0 and < full, end after start.
 * (The radius range is validated here, not only in the RadiusStepper
 * clamp — the model is the last line of defence.)
 */
import type {
  CreateOfficeRequest,
  UpdateOfficeRequest,
} from '../../../services';
import type { OfficeDetail, OfficeRule } from '../../../types/office';

/** Raw form state — numbers as strings while typing. */
export interface OfficeFormState {
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  startTime: string;
  endTime: string;
  lateCutoffMinutes: string;
  fullDayHours: string;
  halfDayHours: string;
}

/**
 * Seed times (18-5 D7): times are mandatory, so a blank start is a
 * guaranteed first-error dead end — a new (or rule-less) form ships a
 * VALID rule by default and the owner edits from there. FE-local consts:
 * the BE's own defaults are the hours/cutoff anchors (15-3); the server
 * stays authoritative over whatever the owner saves.
 */
export const OFFICE_START_TIME_DEFAULT = '09:30';
export const OFFICE_END_TIME_DEFAULT = '18:30';

/** Defaults for a new office — BE create defaults (radius 100, cutoff 15, 8/4 h). */
export function emptyOfficeForm(): OfficeFormState {
  return {
    name: '',
    latitude: null,
    longitude: null,
    radiusM: 100,
    startTime: OFFICE_START_TIME_DEFAULT,
    endTime: OFFICE_END_TIME_DEFAULT,
    lateCutoffMinutes: '15',
    fullDayHours: '8',
    halfDayHours: '4',
  };
}

/**
 * Pre-fill from the detail's rule history (ascending by validFrom — the
 * newest entry is the current rule, or a pending one). An explicit rule
 * always wins; the seed times only cover the no-rule fallback.
 */
export function formFromDetail(detail: OfficeDetail): OfficeFormState {
  const rule: OfficeRule | undefined = detail.rules[detail.rules.length - 1];
  return {
    name: detail.name,
    latitude: detail.latitude,
    longitude: detail.longitude,
    radiusM: detail.radiusM,
    startTime: rule?.startTime ?? OFFICE_START_TIME_DEFAULT,
    endTime: rule?.endTime ?? OFFICE_END_TIME_DEFAULT,
    lateCutoffMinutes: rule ? String(rule.lateCutoffMinutes) : '15',
    fullDayHours: rule ? String(rule.fullDayHours) : '8',
    halfDayHours: rule ? String(rule.halfDayHours) : '4',
  };
}

/** `HH:mm` 24-hour, e.g. 09:00. */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type OfficeFormErrors = {
  name?: string;
  location?: string;
  radiusM?: string;
  startTime?: string;
  endTime?: string;
  lateCutoffMinutes?: string;
  fullDayHours?: string;
  halfDayHours?: string;
};

/**
 * Client-side validation mirroring the server's 422 ranges. Returns an
 * errors object that is empty (all keys undefined) when the form is valid.
 */
export function validateOfficeForm(state: OfficeFormState): OfficeFormErrors {
  const errors: OfficeFormErrors = {};
  const name = state.name.trim();
  if (!name) {
    errors.name = 'Enter an office name';
  } else if (name.length > 80) {
    errors.name = 'Keep the name within 80 characters';
  }
  if (state.latitude === null || state.longitude === null) {
    errors.location = 'Place the office pin on the map';
  }
  if (state.radiusM < 50 || state.radiusM > 1000) {
    errors.radiusM = 'Radius must be 50–1000 metres';
  }
  if (!isValidTime(state.startTime)) {
    errors.startTime = 'Use 24-hour time, e.g. 09:00';
  }
  if (!isValidTime(state.endTime)) {
    errors.endTime = 'Use 24-hour time, e.g. 18:00';
  } else if (isValidTime(state.startTime) && state.endTime <= state.startTime) {
    errors.endTime = 'End time must be after the start time';
  }
  // Number('') === 0 would let a cleared field through as a silent
  // 0-minute grace period — empty is its own error, checked first.
  const cutoffRaw = state.lateCutoffMinutes.trim();
  const cutoff = Number(cutoffRaw);
  if (cutoffRaw === '') {
    errors.lateCutoffMinutes = 'Enter the late cut-off minutes';
  } else if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 120) {
    errors.lateCutoffMinutes = 'Late cut-off must be 0–120 minutes';
  }
  const full = Number(state.fullDayHours);
  if (!Number.isFinite(full) || full <= 0) {
    errors.fullDayHours = 'Full-day hours must be greater than 0';
  }
  const half = Number(state.halfDayHours);
  if (!Number.isFinite(half) || half <= 0) {
    errors.halfDayHours = 'Half-day hours must be greater than 0';
  } else if (Number.isFinite(full) && full > 0 && half >= full) {
    errors.halfDayHours = 'Half-day hours must be less than full-day hours';
  }
  return errors;
}

export function hasErrors(errors: OfficeFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * True when the five rules fields differ from the office's latest rule —
 * the edit save only sends the (complete) rules set when something
 * actually changed, so an unchanged save never seeds a redundant
 * effective-dated row from tomorrow.
 */
export function rulesChanged(state: OfficeFormState, detail: OfficeDetail): boolean {
  const rule = detail.rules[detail.rules.length - 1];
  if (!rule) return true;
  return (
    state.startTime !== rule.startTime ||
    state.endTime !== rule.endTime ||
    Number(state.lateCutoffMinutes) !== rule.lateCutoffMinutes ||
    Number(state.fullDayHours) !== rule.fullDayHours ||
    Number(state.halfDayHours) !== rule.halfDayHours
  );
}

/** True when the profile fields (name/pin/radius) differ from the detail. */
export function profileChanged(state: OfficeFormState, detail: OfficeDetail): boolean {
  return (
    state.name.trim() !== detail.name ||
    state.latitude !== detail.latitude ||
    state.longitude !== detail.longitude ||
    state.radiusM !== detail.radiusM
  );
}
/** The validated form's create payload (validation runs before this). */
export function buildCreateRequest(form: OfficeFormState): CreateOfficeRequest {
  return {
    name: form.name.trim(),
    latitude: form.latitude as number,
    longitude: form.longitude as number,
    radiusM: form.radiusM,
    startTime: form.startTime,
    endTime: form.endTime,
    lateCutoffMinutes: Number(form.lateCutoffMinutes),
    fullDayHours: Number(form.fullDayHours),
    halfDayHours: Number(form.halfDayHours),
  };
}

/**
 * The edit PATCH, diff-gated: profile fields only when they changed (an
 * unchanged save must not rewrite them), the rules five-field set only when
 * a rule field changed (a partial set is a 400 server-side, and an
 * unchanged save must not seed a redundant effective-dated row).
 */
export function buildUpdatePatch(
  form: OfficeFormState,
  detail: OfficeDetail,
): UpdateOfficeRequest {
  const patch: UpdateOfficeRequest = {};
  if (profileChanged(form, detail)) {
    patch.name = form.name.trim();
    patch.latitude = form.latitude as number;
    patch.longitude = form.longitude as number;
    patch.radiusM = form.radiusM;
  }
  if (rulesChanged(form, detail)) {
    patch.startTime = form.startTime;
    patch.endTime = form.endTime;
    patch.lateCutoffMinutes = Number(form.lateCutoffMinutes);
    patch.fullDayHours = Number(form.fullDayHours);
    patch.halfDayHours = Number(form.halfDayHours);
  }
  return patch;
}
