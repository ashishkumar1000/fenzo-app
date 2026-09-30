/**
 * correctionStageModel.ts — the pure decision layer for the owner's
 * correction form (Story 18-4 D2). Same doctrine as dayDetailModel: all
 * date/time work is string surgery on the AD-7 carried instants — never a
 * Date built from an instant. The component (CorrectionStage.tsx) renders;
 * this module derives.
 */
import type {
  CorrectionStatus,
} from '../../../services/resources/attendanceCorrections';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';

export const NOTE_MAX = 500;
export const NOTE_NEAR_LIMIT = 450;

/** The XOR arms as UI (D2). */
export type CorrectionMode = 'times' | 'status';

export const MODE_OPTIONS = [
  { value: 'times' as const, label: 'Times' },
  { value: 'status' as const, label: 'Status' },
];

export const STATUS_OPTIONS = [
  { value: 'present' as const, label: 'Present' },
  { value: 'half_day' as const, label: 'Half day' },
  { value: 'absent' as const, label: 'Absent' },
];

const CORRECTABLE: readonly string[] = ['present', 'half_day', 'absent'];

/** The `HH:mm` wall-clock part of a carried instant (string surgery — the
 *  offsetInstant rules); null/unparseable → '' (no pre-fill). */
export function wallTime(iso: string | null | undefined): string {
  if (iso == null) return '';
  return /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(iso)?.[1] ?? '';
}

/** A checkout pre-fills only when its carried date IS the work date: the
 *  write anchors every instant to workDate (D2), so a next-day checkout's
 *  wall time (e.g. "01:30") cannot round-trip — pre-filling it would
 *  guarantee a 422 INVALID_RANGE on save. Left empty it means the saved
 *  correction CLEARS the displayed check-out (the write replaces the pair:
 *  the BE lands manualCheckoutAt null — corrections.service.ts), which the
 *  Clear action on the picker field now expresses deliberately. */
export function prefillCheckout(
  day: DayStatusRow | null,
  workDate: string,
): string {
  const iso = day?.checkoutAt;
  if (iso == null || iso.slice(0, 10) !== workDate) return '';
  return wallTime(iso);
}

/** Times mode for any day carrying instants (a times-override pre-fills
 *  them; a GPS day starts from them); everything else — a status override,
 *  the engine's past-absent, a no-row day — opens in Status mode. */
export function initialMode(day: DayStatusRow | null): CorrectionMode {
  if (day != null && (day.checkinAt != null || day.checkoutAt != null)) {
    return 'times';
  }
  return 'status';
}

/** Status mode pre-selects the day's CURRENT grade when the wire accepts it
 *  (a status override stays selected; the engine's past-absent starts from
 *  Absent) and Present otherwise — the segmented pick always has a real
 *  selection, so the Save gate in Status mode is the note alone (the spec's
 *  gate names Times-mode validity only). */
export function initialStatus(day: DayStatusRow | null): CorrectionStatus {
  return day != null && CORRECTABLE.includes(day.status)
    ? (day.status as CorrectionStatus)
    : 'present';
}
