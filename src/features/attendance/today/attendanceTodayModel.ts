/**
 * attendanceTodayModel.ts — the punch button's pure state machine
 * (Story 16-4, spec D4; 20-3 adds the geofence rungs + the status-card
 * model) and the exact copy table (spec §4).
 *
 * One derivation function, first match wins:
 *   offline → permissionDenied → preciseOff → serviceOff → rateLimited →
 *   dialogPending → resolving → done → readyOut → readyIn
 *
 * Priority rationale: offline blocks everything; the location states block
 * the tap legally; the rate limit's disabled-ness is time-bound;
 * dialogPending/resolving are the latches that make double-taps no-ops;
 * done replaces the button entirely (never both visible — AC).
 */
import { formatWorkedMinutes } from '../../../utils/offsetInstant';
import { haversineMetres } from '../../../utils/distanceUtils';
import type {
  AttendanceTodayFacts,
  AttendanceTodayRecord,
} from '../../../services/resources/attendanceMe';

export type AttendanceLocationPermission =
  | 'granted'
  | 'denied'
  | 'preciseOff'
  | 'serviceOff';

/** A location fix kept by the screen's prescreen capture (the punch
 *  geofence's client-side input). `capturedAt` is epoch ms — freshness is
 *  rechecked against the ticker on every derivation, never stored as a
 *  verdict. */
export interface PunchFixSample {
  latitude: number;
  longitude: number;
  capturedAt: number;
}

/** The anchored office's geofence inputs from the summary. `radiusM` null
 *  (no office / radiusless column / field absent on the wire) = the client
 *  can never lock — fail-safe, the server stays authoritative anyway. */
export interface PunchOffice {
  latitude: number;
  longitude: number;
  radiusM: number | null;
  name: string | null;
}

/** A prescreen fix younger than this may ground a geofence posture; an
 *  older or missing one falls back to today's unlocked behaviour. */
export const PUNCH_FIX_FRESH_MS = 120_000;

export type TodayButtonState =
  | { kind: 'offline' }
  | { kind: 'permissionDenied' }
  | { kind: 'preciseOff' }
  | { kind: 'serviceOff' }
  | { kind: 'rateLimited'; remainingS: number; action: 'in' | 'out' }
  | { kind: 'dialogPending' }
  | { kind: 'resolving' }
  | { kind: 'done' }
  /** `distanceM` present ONLY when the prescreen fix is fresh and inside
   *  the fence — its absence is the no-fix fallback (the mockup's dimmed
   *  row-5 posture, never the inviting ready face). */
  | { kind: 'readyOut'; distanceM?: number }
  | { kind: 'readyIn'; distanceM?: number }
  | { kind: 'locked'; distanceM: number }
  | { kind: 'lockedOut'; distanceM: number };

export interface TodayModelInput {
  permission: AttendanceLocationPermission;
  online: boolean;
  /** True when the summary has LOADED — no interactive check-in before the
   *  day facts are known (the holiday gate must be able to fire). */
  factsKnown: boolean;
  record: AttendanceTodayRecord | null;
  resolving: boolean;
  dialogPending: boolean;
  /** Epoch ms when the rate-limit block lifts; null when not blocked. */
  rateLimitedUntil: number | null;
  now: number;
  /** The prescreen's freshest fix + the anchored office (geofence rungs).
   *  Either absent ⇒ never locked. */
  fix?: PunchFixSample | null;
  office?: PunchOffice | null;
}

/**
 * The geofence prescreen: with a FRESH fix and a known radius, distance
 * beyond the radius locks the punch (locked/lockedOut, by record state);
 * every other combination — no fix, stale fix, no office, radiusless
 * office — falls through unlocked. A lock is a CLIENT prescreen only: the
 * press path never consults it, and the server still gates every punch.
 */
function geofenceLock(
  input: TodayModelInput,
): { locked: true; distanceM: number } | { locked: false } {
  const fix = input.fix;
  const office = input.office;
  if (!fix || !office || office.radiusM == null) return { locked: false };
  // A backward clock step would make a capturedAt in the future read as
  // forever-fresh — the fail-safe direction is unlocked, like any stale fix.
  if (input.now < fix.capturedAt) return { locked: false };
  if (input.now - fix.capturedAt > PUNCH_FIX_FRESH_MS) return { locked: false };
  const distanceM = haversineMetres(fix, office);
  return distanceM > office.radiusM
    ? { locked: true, distanceM }
    : { locked: false };
}

/** The straight-line distance to the office when the prescreen fix is
 *  fresh (status-card input); null when the fix is missing/stale or the
 *  office/radius is unknown — exactly the cases that may never lock. */
export function freshDistanceM(
  fix: PunchFixSample | null | undefined,
  office: PunchOffice | null | undefined,
  now: number,
): number | null {
  if (!fix || !office || office.radiusM == null) return null;
  if (now < fix.capturedAt) return null;
  if (now - fix.capturedAt > PUNCH_FIX_FRESH_MS) return null;
  return haversineMetres(fix, office);
}

export function deriveTodayButtonState(input: TodayModelInput): TodayButtonState {
  if (!input.online) return { kind: 'offline' };
  if (input.permission === 'denied') return { kind: 'permissionDenied' };
  if (input.permission === 'preciseOff') return { kind: 'preciseOff' };
  if (input.permission === 'serviceOff') return { kind: 'serviceOff' };
  if (input.rateLimitedUntil !== null && input.rateLimitedUntil > input.now) {
    return {
      kind: 'rateLimited',
      // Clamped to the awarded window: a backward clock change can push the
      // raw delta past it, and a time-bound disabled state must never turn
      // indefinite.
      remainingS: Math.min(
        Math.ceil((input.rateLimitedUntil - input.now) / 1000),
        MAX_RATE_WINDOW_S,
      ),
      // The pending action outlives the block: while checked in, the
      // blocked button is a blocked CHECK OUT, never a "Check in".
      action: input.record ? 'out' : 'in',
    };
  }
  if (input.dialogPending) return { kind: 'dialogPending' };
  if (input.resolving) return { kind: 'resolving' };
  if (input.record?.checkoutAt) return { kind: 'done' };
  const geo = geofenceLock(input);
  if (geo.locked) {
    // Beyond the fence: with an open record the punch out is locked, with
    // none the punch in is. The button renders non-interactive — the lock
    // never reaches the press path (the server re-judges every press).
    return input.record
      ? { kind: 'lockedOut', distanceM: geo.distanceM }
      : { kind: 'locked', distanceM: geo.distanceM };
  }
  if (!input.factsKnown) {
    // Facts unknown (first load in flight or failed) — the button is not
    // interactive until the holiday gate COULD fire. Rendered as readyIn
    // but disabled via factsKnown by the caller.
    return withDistance({ kind: 'readyIn' }, input);
  }
  return input.record
    ? withDistance({ kind: 'readyOut' }, input)
    : withDistance({ kind: 'readyIn' }, input);
}

/** Attach the fresh in-fence distance to a ready posture when the prescreen
 *  knows it — the button's ready-vs-fallback visual discriminator. Absent
 *  keeps the field out of the object entirely, so exact-shape pins on the
 *  plain rungs stay valid. */
function withDistance(
  state: { kind: 'readyIn' } | { kind: 'readyOut' },
  input: TodayModelInput,
): TodayButtonState {
  const distanceM = freshDistanceM(input.fix, input.office, input.now);
  return distanceM != null ? { ...state, distanceM } : state;
}

/** The PRD's rate window (16-1 D6) — the fallback when the Retry-After
 *  header is missing, and the countdown clamp ceiling. */
export const MAX_RATE_WINDOW_S = 600;

/** The countdown label, "Try again in 9:42" (M:SS). A clamped, always-
 *  finite remaining: 0 renders as 0:00, negatives never leak. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.trunc(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The countdown in words for the screen-reader announcement ("Try again
 *  in 9 minutes") — an M:SS chip is unreadable through a11y. */
export function formatCountdownWords(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(Math.max(0, totalSeconds) / 60));
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Below-button message per settled outcome (server copy is verbatim —
 *  the AC's "exact PRD-specified message" travels in ApiError.message). */
export type TodayOutcomeMessage =
  | { tone: 'error'; text: string }
  | { tone: 'info'; text: string };

export function messageForApiError(err: {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}): TodayOutcomeMessage {
  switch (err.code) {
    case 'ATTENDANCE_RATE_LIMITED':
      return {
        tone: 'error',
        text: err.message || 'Too many attempts. Try again in 10 minutes.',
      };
    default:
      // Every catalogued code carries its own PRD copy server-side
      // ("You are 600 m from …", "Check in before checking out", …);
      // transport errors carry their own copy from toApiError. An empty
      // message (a non-ApiError rejection) falls back to the shared line
      // rather than rendering nothing.
      //
      // ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED (17-8 D4) has NO entry
      // here on purpose: its AC copy lives in exactly one place — the
      // leave dialog. A 409 with that code is intercepted by the hook's
      // press continuation (the awaited wire-driven fallback); one that
      // still reaches this table is the terminal posture (a flag-carrying
      // retry cannot 409) and renders the generic server-message error.
      return {
        tone: 'error',
        text: err.message || 'Something went wrong with that request.',
      };
  }
}

/** The checked-in line above the Check out button
 *  ("Checked in 10:22 AM · Late by 22 min"). */
/** The punch card's data (2026-10 tab redesign) — the two tile times, the
 *  total-logged pill and the late/early pills, from the merged record.
 *  Unlike the old done-card model this is built for EVERY record state
 *  (checked-in-only included: the checkout tile reads "—", no worked
 *  pill yet), so the mid-session card and the button coexist. */
export interface TodayTilesModel {
  /** Tile times, "4:06 AM" — null renders the "—" placeholder. */
  checkinText: string | null;
  checkoutText: string | null;
  /** The green pill's value; null renders no pill (minutes unknown). */
  workedText: string | null;
  /** The amber pill's value ("Late by 22 min" / "Early by 713 min"). */
  lateText: string | null;
  earlyText: string | null;
  /** The early pill's caption — how long before the shift end
   *  ("11 h 53 m before shift"); null = no caption. */
  earlyBeforeShiftText: string | null;
}

export function buildTodayTiles(
  record: AttendanceTodayRecord,
  formatTime: (iso: string) => string | null,
): TodayTilesModel {
  const lateText =
    record.isLate && record.lateMinutes !== null && record.lateMinutes > 0
      ? `Checkin Late by ${formatWorkedMinutes(record.lateMinutes)} min`
      : null;
  const earlyText =
    record.earlyCheckout && record.earlyCheckoutMinutes !== null
      ? `Early Checkout by ${record.earlyCheckoutMinutes} min`
      : null;
  const beforeShift =
    record.earlyCheckout && record.earlyCheckoutMinutes !== null
      ? formatWorkedMinutes(record.earlyCheckoutMinutes)
      : null;
  return {
    checkinText: formatTime(record.checkinAt),
    checkoutText: record.checkoutAt ? formatTime(record.checkoutAt) : null,
    workedText: formatWorkedMinutes(record.workedMinutes),
    lateText,
    earlyText,
    earlyBeforeShiftText: beforeShift !== null ? `${beforeShift} before shift` : null,
  };
}

/** The offline block message (one string, three call sites in the hook). */
export const offlineMessage = "You're offline. Check-in needs a working connection.";

/** The capture-failure copy per union member (UX table verbatim). */
export function captureFailureMessage(failure: unknown): string {
  switch (failure) {
    case 'timeout':
      return "Couldn't get your location. Move to an open area and try again.";
    case 'permission':
      return 'Attendance needs your location to check in and out. You can still view your records and apply for leave without it.';
    case 'unavailable':
      return 'Location services are unavailable. Turn on location and try again.';
    case 'stale':
      return 'Your location seems outdated. Refresh GPS and try again';
    default:
      return 'Could not determine your location. Try again.';
  }
}

/** True when the tap needs the holiday/weekly-off pre-flight confirm
 *  (16-4 scope). `today` absent (legacy backend) never asks — the server
 *  still records the truth. Mutually exclusive with `needsLeaveConfirm`
 *  by construction: this is true only when `isWorkingDay` is false, and
 *  the leave predicate requires it true — there IS no ladder-order rule
 *  to pin (leave + holiday can only ever surface the holiday dialog,
 *  exactly as the BE gate behaves). */
export function needsHolidayConfirm(
  today: AttendanceTodayFacts | null | undefined,
): boolean {
  if (!today) return false;
  return today.isWeeklyOff || today.isHoliday;
}

// --- The punch status card (the approved mockup's four geofence states,
// --- copy verbatim; every other posture carries its existing copy). ----

export type PunchCardTone = 'done' | 'progress' | 'cancelled' | 'scheduled' | 'neutral';

/** One body span. `strong` = bold in the card's own ink (names, times);
 *  `danger` = bold red (distances and radii — the mockup's accent). */
export interface PunchBodySegment {
  text: string;
  emphasis?: 'strong' | 'danger';
}

export interface PunchStatusCardModel {
  tone: PunchCardTone;
  title: string | null;
  chip: string | null;
  segments: PunchBodySegment[];
  /** The flat reading a screen reader announces. */
  announce: string;
}

/** Metres with the mockup's comma grouping ("28 m" / "1,357 m"). Grouping
 *  is done by hand — a toLocaleString dependency on Hermes Intl config is
 *  one more environment axis than a display string earns. */
export function formatMetresGrouped(metres: number): string {
  const rounded = Math.max(0, Math.round(metres));
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} m`;
}

const seg = (text: string, emphasis?: PunchBodySegment['emphasis']): PunchBodySegment =>
  emphasis ? { text, emphasis } : { text };

function card(
  tone: PunchCardTone,
  title: string | null,
  chip: string | null,
  segments: PunchBodySegment[],
): PunchStatusCardModel {
  // The segments carry their own spacing (they render as contiguous Text
  // spans) — the announce must read them verbatim, never re-join with
  // extra separators.
  const body = segments.map(s => s.text).join('');
  return {
    tone,
    title,
    chip,
    segments,
    announce: title ? `${title} ${body}` : body,
  };
}

/**
 * The status card under the punch button, per posture. The four geofence
 * states render the approved mockup copy verbatim; the blocked postures
 * carry their existing remediation copy in the same visual language; the
 * done posture renders NO card (the punch tiles are the done render).
 *
 * `checkinTimeText`/`elapsedText` are preformatted by the caller (wall-
 * clock rendering is a view concern); `elapsedText` null degrades the
 * shift-active body gracefully rather than lying with a placeholder.
 */
export function punchStatusCard(input: {
  state: TodayButtonState;
  fix: PunchFixSample | null | undefined;
  office: PunchOffice | null | undefined;
  now: number;
  checkinTimeText: string | null;
  elapsedText: string | null;
}): PunchStatusCardModel | null {
  const { state, fix, office, now } = input;
  const distance = freshDistanceM(fix, office, now);
  const officeName = office?.name ?? 'your office';
  const inRadius = distance !== null && office != null && office.radiusM !== null;

  switch (state.kind) {
    case 'readyIn': {
      if (!inRadius || distance === null || office?.radiusM == null) {
        // No fresh fix (or no fence to judge against): today's fallback —
        // the punch stays available, the card explains what's missing.
        return card('neutral', 'Getting your location…', null, []);
      }
      return card('done', 'Within Office Geofence', 'READY TO PUNCH', [
        seg('You are at '),
        seg(officeName, 'strong'),
        seg(' ('),
        seg(formatMetresGrouped(distance), 'danger'),
        seg(' away). Location verified via GPS.'),
      ]);
    }
    case 'readyOut': {
      if (!inRadius) {
        return card('neutral', 'Getting your location…', null, []);
      }
      const elapsed = input.elapsedText;
      return card('progress', 'Shift Active • In Office', 'READY TO PUNCH OUT', [
        seg('Checked in at '),
        seg(input.checkinTimeText ?? '—', 'strong'),
        ...(elapsed ? [seg(' ('), seg(elapsed, 'danger'), seg(' elapsed)')] : []),
        seg('. Ready to conclude your workday at '),
        seg(officeName, 'strong'),
        seg('.'),
      ]);
    }
    case 'locked': {
      return card('cancelled', 'Outside Office Geofence', 'PUNCH DISABLED', [
        seg('You are '),
        seg(formatMetresGrouped(state.distanceM), 'danger'),
        seg(' from '),
        seg(officeName, 'strong'),
        seg(' branch. Move within '),
        seg(formatMetresGrouped(office?.radiusM ?? 0), 'danger'),
        seg(' to punch.'),
      ]);
    }
    case 'lockedOut': {
      return card('scheduled', 'Out of Bounds for Check-out', 'LOCKED', [
        seg('You checked in at '),
        seg(input.checkinTimeText ?? '—', 'strong'),
        seg('. You are currently '),
        seg(formatMetresGrouped(state.distanceM), 'danger'),
        seg(' away. Move closer to punch out.'),
      ]);
    }
    case 'offline':
      return card('neutral', null, null, [seg(offlineMessage)]);
    case 'permissionDenied':
      return card('neutral', null, null, [seg(captureFailureMessage('permission'))]);
    case 'preciseOff':
      return card('neutral', null, null, [
        seg('Turn on precise location to check in'),
      ]);
    case 'serviceOff':
      return card('neutral', null, null, [seg(captureFailureMessage('unavailable'))]);
    case 'rateLimited':
      return card('neutral', null, null, [
        seg('Too many attempts. '),
        seg(`Try again in ${formatCountdown(state.remainingS)}`, 'strong'),
      ]);
    case 'resolving':
      return card('neutral', 'Getting your location…', null, []);
    default:
      // dialogPending: a confirm dialog owns the moment — no card behind
      // it. done: the tiles are the done render.
      return null;
  }
}

/**
 * True when the check-in needs the FR-9 full-day-leave confirm (17-8 D2):
 * the FULL byte-parity mirror of the BE D11 gate (fenzit-be
 * `check-in-out.service.ts:186-195` — `leaveGateActive`):
 *
 *   kind === 'check_in' && ctx.isWorkingDay && ctx.leaveState !== null &&
 *   ctx.leavePart === 'full_day'
 *
 * with `today != null` standing in for the summary's legacy absence
 * signal (a pre-17-8 wire has no leave fields; `today` absent is the
 * 16-4 signal). A model test asserts the parity against the service
 * condition conjunct-for-conjunct. Half-day parts (`first_half` /
 * `second_half`) are strictly NOTHING — no dialog, no subtext, no copy
 * anywhere (the gate is full_day-only, so pass-through is structural).
 * Check-out is never gated (FR-9 is check-in only).
 */
export function needsLeaveConfirm(
  today: AttendanceTodayFacts | null | undefined,
  kind: 'check_in' | 'check_out',
): boolean {
  return (
    kind === 'check_in' &&
    today != null &&
    today.isWorkingDay === true &&
    today.leaveState != null &&
    today.leavePart === 'full_day'
  );
}
