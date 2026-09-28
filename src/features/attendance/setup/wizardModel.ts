/**
 * wizardModel — pure helpers for the 15-8 setup wizard.
 *
 * One source for the step ORDER (`SETUP_STEPS`, mirroring 15-2's DB CHECK
 * vocabulary `'offices' | 'timings' | 'weekly_off' | 'holidays' |
 * 'employees'` — UX-DR6) and for the two client-side gates the wizard
 * mirrors 1:1 from the server:
 *
 *  - `continueGateReason` — when Continue/Skip is disabled per step, with
 *    the explanatory caption (step 3 requires a saved canonical default;
 *    Holidays is the only skippable step; step 5 has no Continue).
 *  - `completionGateReason` — the "Enable attendance" gate: ≥1 live office
 *    AND ≥1 roster row whose enrolment covers today and whose assignment
 *    is a LIVE office — derived from the UNGATED wire fields (see
 *    `enrolmentCoversToday`; never the kill-switch-gated module flag),
 *    mirroring the server's `ATTENDANCE_SETUP_INCOMPLETE` rule so a
 *    future-dated row can never satisfy the mirror.
 *
 * Nothing here touches React, navigation or the API — the hook and the
 * screen compose these. The union TYPE's wire home is the setup resource
 * (the PATCH body); services never import from features, so the model
 * re-exports it rather than redefining it.
 */
import type {
  EnrolmentOverview,
  IsoWeekday,
  SetupStep,
} from '../../../services';
import type { Office, OfficeRule } from '../../../types/office';

export type { SetupStep } from '../../../services';

/** The fixed walking order (UX-DR6). Never reorder shipped wizards — a
 *  resumed `currentStep` from the server is an index into THIS list. */
export const SETUP_STEPS: readonly SetupStep[] = [
  'offices',
  'timings',
  'weekly_off',
  'holidays',
  'employees',
];

/** Plain-business-English titles, in `SETUP_STEPS` order. */
export const STEP_TITLES: Record<SetupStep, string> = {
  offices: 'Offices',
  timings: 'Timings & hours',
  weekly_off: 'Weekly off',
  holidays: 'Holidays',
  employees: 'Employees',
};

/** The one-line "what this step is for" under each title. */
export const STEP_DESCRIPTIONS: Record<SetupStep, string> = {
  offices: 'Add the places your team works from.',
  timings: 'Review each office\u2019s working hours and rules.',
  weekly_off: 'Pick the days your team is off each week.',
  holidays: 'Add one-off holidays on top of the weekly off.',
  employees: 'Choose who tracks attendance and where.',
};

/** 0-based position of a step in the walking order. */
export function stepIndex(step: SetupStep): number {
  return SETUP_STEPS.indexOf(step);
}

/** 1-based position — the StepIndicator's `current`. */
export function stepNumber(step: SetupStep): number {
  return stepIndex(step) + 1;
}

/** The step after `step`, or null on the final step (Employees) — the
 *  marker only ever advances through this. */
export function nextStep(step: SetupStep): SetupStep | null {
  const i = stepIndex(step) + 1;
  return i < SETUP_STEPS.length ? SETUP_STEPS[i] : null;
}

/** The step before `step`, or null on the first step — the in-session Back
 *  control walks this way; the server marker never does. */
export function previousStep(step: SetupStep): SetupStep | null {
  const i = stepIndex(step) - 1;
  return i >= 0 ? SETUP_STEPS[i] : null;
}

/** Live (not archived) offices — the picker, the gates and the summaries
 *  count ONLY these (`archivedAt == null`). */
export function liveOffices(offices: Office[]): Office[] {
  return offices.filter((office) => office.archivedAt === null);
}

/**
 * The RAW per-employee enrolment fact, derived from UNGATED wire fields.
 * The roster's `attendanceEnabled` is the TENANT MODULE flag
 * (`settings.enabled AND setup_completed_at IS NOT NULL`) — false for
 * every row exactly while the wizard runs (setup not yet completed), so
 * no gate may read it. The view ships the enrolment truth ungated in
 * `attendanceStartDate`: the current enrolment's start (`<= today` =
 * covers today; `> today` = upcoming; `null` = not enrolled — null does
 * NOT mean "covers today"). Found live on device, story 15-8 walkthrough.
 */
export function enrolmentCoversToday(
  row: Pick<EnrolmentOverview, 'attendanceStartDate'>,
  today: string,
): boolean {
  return row.attendanceStartDate !== null && row.attendanceStartDate <= today;
}

/** One-line rule summary for a step-2 row — "09:00–18:00 · late after 15 min · 8 h full day". */
export function describeOfficeRule(rule: OfficeRule): string {
  return `${rule.startTime}\u2013${rule.endTime} \u00B7 late after ${rule.lateCutoffMinutes} min \u00B7 ${rule.fullDayHours} h full day`;
}

/** What the per-step Continue gate reads — computed once by the screen
 *  from the fetched server truth. */
export interface StepGateSnapshot {
  /** Live offices only. */
  liveOfficeCount: number;
  /** Live offices whose `rule` is null (post-create this is always 0 —
   *  an office is created WITH its rule; the check guards drift). */
  liveOfficesMissingRule: number;
  /**
   * The saved tenant default's day set, or null when NO default exists
   * server-side. Identity carries the "saved" meaning — a saved EMPTY set
   * (`days: []`, the works-all-week rule) is a real saved view and counts
   * as saved; only a null (never configured, or cleared) gates Continue.
   */
  weeklyOffDefaultDays: IsoWeekday[] | null;
}

/**
 * Why Continue (or Skip) is disabled on a step, or null when enabled.
 * Step 3 is NOT skippable — a saved default weekly off is required
 * (EXPERIENCE: Holidays is the only skippable step). Holidays' Continue is
 * always enabled and its Skip is the same marker advance; Employees has no
 * Continue (the "Enable attendance" gate owns that step — see
 * `completionGateReason`).
 */
export function continueGateReason(
  step: SetupStep,
  snapshot: StepGateSnapshot,
): string | null {
  if (step === 'offices') {
    return snapshot.liveOfficeCount > 0
      ? null
      : 'Add at least one office to continue.';
  }
  if (step === 'timings') {
    if (snapshot.liveOfficeCount === 0) {
      return 'Add at least one office to continue.';
    }
    return snapshot.liveOfficesMissingRule === 0
      ? null
      : 'Every office needs its timings set before you continue.';
  }
  if (step === 'weekly_off') {
    return snapshot.weeklyOffDefaultDays !== null
      ? null
      : 'Save your default weekly off first.';
  }
  return null;
}

/** What the "Enable attendance" gate reads — the wizard's own server truth
 *  plus today's IST date (`YYYY-MM-DD`). */
export interface CompletionGateSnapshot {
  offices: Office[];
  roster: EnrolmentOverview[];
  today: string;
}

/**
 * Why "Enable attendance" is disabled, or null when the client gate is met.
 * Mirrors the server's completion rule 1:1 (no submit-then-fail):
 *   ≥1 live office AND ≥1 roster row whose enrolment covers TODAY
 *   (`enrolmentCoversToday` — raw truth; never the module flag) and whose
 *   `officeId` is a LIVE office (the view nulls assignments of archived
 *   offices). The wizard itself only writes today-dated enrolments, but a
 *   future-dated row appearing (15-9's start dates) must not silently
 *   satisfy the mirror.
 */
export function completionGateReason(
  snapshot: CompletionGateSnapshot,
): string | null {
  const live = liveOffices(snapshot.offices);
  if (live.length === 0) {
    return 'Add at least one office to enable attendance.';
  }
  const liveOfficeIds = new Set(live.map((office) => office.id));
  const enrolled = snapshot.roster.some(
    (row) =>
      enrolmentCoversToday(row, snapshot.today) &&
      row.officeId !== null &&
      liveOfficeIds.has(row.officeId),
  );
  if (!enrolled) {
    return 'Turn on attendance for at least one employee assigned to a live office, starting today.';
  }
  return null;
}
