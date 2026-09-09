/**
 * notificationCardModel.ts — pure card-derivation logic for the redesigned
 * notifications screen (Story 3.4 redesign). No React, no network.
 *
 * The screen's flat, newest-first notification list is grouped per job: each
 * card is one job, and the card's stage timeline is DERIVED from that job's
 * own notifications (each notification is one workflow-step event with a
 * `createdAt`) — never a per-row fetch, never extra API calls. A job whose
 * earlier steps paginated off the loaded pages simply renders those stages
 * pending; that degradation is accepted, not fetched around.
 *
 * The payload is the raw JSONB the advance_workflow_step RPC wrote
 * (`job_number` / `step` / `technician_name` inside `payload`) — same
 * unknown-value rule as `notificationBannerModel.ts`: anything unexpected
 * degrades to the generic copy / neutral status, never a crash, never
 * `undefined` on screen.
 *
 * The six workflow steps (api-contracts §1, `jobDetail/eventLabels.ts`
 * STEP_ORDER) are condensed into FOUR display stages matching the redesign
 * reference — photos and signature belong to the completion flow, so they
 * fold into "Completed". This feature owns its own vocabulary copy for the
 * same reason the banner model does: cross-feature vocabulary stays
 * duplicated, not shared.
 *
 * Completion is its own ground truth, separate from the display stages:
 * `TERMINAL_STEPS` (only the real `completed` step) drives the Completed
 * filter chip and the stepper's done-glyph — reaching the Completed display
 * stage via photos/signature is still mid-completion-flow, i.e. Active.
 */
import type { ApiNotification } from '../../services';
import type { StatusKey } from '../../theme';

/** The four display stages of a card's timeline, in workflow order. */
export const DISPLAY_STAGES = [
  { key: 'on_my_way', label: 'On my way', steps: ['on_my_way'] },
  { key: 'arrived', label: 'Arrived', steps: ['arrived'] },
  { key: 'in_progress', label: 'In progress', steps: ['in_progress'] },
  {
    key: 'completed',
    label: 'Completed',
    steps: ['photos_uploaded', 'signature_captured', 'completed'],
  },
] as const;

export type DisplayStageKey = (typeof DISPLAY_STAGES)[number]['key'];

/** Generic copy when the payload doesn't carry name + job number. */
export const CARD_FALLBACK_TITLE = 'Job status updated';

/** The filter vocabulary of the chip row; `all` filters nothing. */
export type NotificationFilter = 'all' | 'active' | 'completed';

export interface CardStage {
  key: DisplayStageKey;
  label: string;
  /** Earliest `createdAt` among the stage's member events; null = not reached. */
  reachedAt: string | null;
  /** done = behind the current stage · current = where the job is now · pending. */
  state: 'done' | 'current' | 'pending';
}

export interface NotificationCardData {
  jobId: string;
  /** Payload display fields — null when the payload drifted (renders generic). */
  jobNumber: string | null;
  technicianName: string | null;
  /** Every loaded notification of this job, newest first. */
  events: ApiNotification[];
  /** Raw workflow step of the latest event; null when missing/unknown shape. */
  currentStep: string | null;
  /** Display stage containing `currentStep`; null when the step is unknown. */
  currentStage: DisplayStageKey | null;
  /**
   * True only when the job reached a TERMINAL step (`completed`) — drives the
   * Completed filter and the stepper's done-glyph, NOT `currentStage` (photos/
   * signature fold into the Completed display stage while still mid-flow).
   * Coalesced across ALL events: a drifted/unknown latest payload cannot
   * un-finish a job whose history carries the terminal step.
   */
  isCompleted: boolean;
  stages: CardStage[];
  isUnread: boolean;
  unreadIds: string[];
  latestCreatedAt: string;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Raw workflow step → Fenzit status family for the card's banner. */
const STEP_STATUS = {
  on_my_way: 'scheduled',
  arrived: 'scheduled',
  in_progress: 'progress',
  photos_uploaded: 'progress',
  signature_captured: 'progress',
  completed: 'done',
} as const satisfies Record<string, StatusKey>;

type KnownStep = keyof typeof STEP_STATUS;

/**
 * The workflow steps at which a job is actually FINISHED — the ground truth
 * for the Completed filter chip and the stepper's done-glyph. Deliberately
 * separate from `DISPLAY_STAGES`: photos/signature fold into the "Completed"
 * display stage, but a job sitting there is still mid-completion-flow.
 *
 * Future-proofing: a step the server adds later is never terminal, so a new
 * status always fails safe to Active (banner neutral, filter Active). Do NOT
 * add a non-completed final step (e.g. a future `cancelled`) here — it would
 * land those jobs in the Completed chip with a green done-check; such a step
 * needs its own filter treatment first. The `KnownStep` tie makes a typo a
 * compile error, not a silent behaviour change.
 */
const TERMINAL_STEPS: readonly KnownStep[] = ['completed'];

/** A job is finished only when its current step is a terminal one. */
function isTerminalStep(step: string | null): boolean {
  // Widened for the lookup: wire values are unknown strings — the
  // `KnownStep` element type guards the DECLARATION, not the search.
  return step !== null && (TERMINAL_STEPS as readonly string[]).includes(step);
}

/**
 * Status family for the banner of a card whose current step is `step`.
 * Unknown values → neutral (the unknown-value rule above).
 */
export function stepStatusKey(step: string | null): StatusKey {
  if (step === null || !Object.hasOwn(STEP_STATUS, step)) return 'neutral';
  return STEP_STATUS[step as KnownStep];
}

/** A notification's raw workflow step; null when missing/unknown shape. */
const stepOfEvent = (n: ApiNotification): string | null =>
  isText(n.payload.step) ? n.payload.step : null;

/** The display stage a raw step folds into; null when the step is unknown. */
function stageOfStep(step: string | null): DisplayStageKey | null {
  if (step === null) return null;
  for (const stage of DISPLAY_STAGES) {
    if ((stage.steps as readonly string[]).includes(step)) return stage.key;
  }
  return null;
}

/**
 * Groups the flat newest-first list into one card per job. Card order is
 * first appearance — the store's newest-first sort, untouched.
 */
export function groupNotificationsByJob(items: ApiNotification[]): NotificationCardData[] {
  const byJob = new Map<string, ApiNotification[]>();
  for (const n of items) {
    const group = byJob.get(n.jobId);
    if (group) group.push(n);
    else byJob.set(n.jobId, [n]);
  }
  return [...byJob.entries()].map(([jobId, events]) => buildCard(jobId, events));
}

function buildCard(jobId: string, events: ApiNotification[]): NotificationCardData {
  // The store's list is newest-first (the server's sort, never re-sorted
  // client-side) — but a single ordering slip would silently render a stale
  // banner, filter bucket and timeline, so the latest event is re-derived by
  // `createdAt` instead of trusting `events[0]`.
  const latest = events.reduce((a, b) =>
    Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a,
  );
  const currentStep = stepOfEvent(latest);
  // Completion coalesces across ALL events (same rule as the display
  // fields): a drifted/unknown LATEST payload must not un-finish a job
  // whose history carries the terminal step.
  const isCompleted =
    isTerminalStep(currentStep) || events.some(e => isTerminalStep(stepOfEvent(e)));
  const currentStage = stageOfStep(currentStep);
  const currentStageIndex = DISPLAY_STAGES.findIndex(s => s.key === currentStage);
  const earliest = (a: string, b: string) => (Date.parse(a) <= Date.parse(b) ? a : b);

  const stages: CardStage[] = DISPLAY_STAGES.map(stage => {
    // Earliest `createdAt` among the events folding into this stage.
    let reachedAt: string | null = null;
    for (const event of events) {
      const step = stepOfEvent(event);
      if (step !== null && (stage.steps as readonly string[]).includes(step)) {
        reachedAt = reachedAt === null ? event.createdAt : earliest(reachedAt, event.createdAt);
      }
    }
    const index = DISPLAY_STAGES.findIndex(s => s.key === stage.key);
    // A stage reached BEYOND the current one (out-of-order events, a job
    // stepped back) renders pending, not done — the timeline must never
    // claim the job got further than its current step.
    const state: CardStage['state'] =
      reachedAt === null || (currentStageIndex >= 0 && index > currentStageIndex)
        ? 'pending'
        : index === currentStageIndex
          ? 'current'
          : 'done';
    return { key: stage.key, label: stage.label, reachedAt, state };
  });

  // Unknown current step (drifted payload, or a brand-new server step): no
  // display stage maps to it, so the timeline above would show no `current`
  // marker at all. Fall back to the latest stage actually reached — the
  // banner goes neutral, but the timeline still shows where the job is.
  if (currentStageIndex < 0) {
    let latestReached = -1;
    for (let i = 0; i < stages.length; i++) {
      const at = stages[i].reachedAt;
      if (
        at !== null &&
        (latestReached < 0 || Date.parse(at) > Date.parse(stages[latestReached].reachedAt ?? ''))
      ) {
        latestReached = i;
      }
    }
    if (latestReached >= 0) stages[latestReached].state = 'current';
  }

  const unreadIds = events.filter(n => n.readAt === null).map(n => n.id);

  // Display fields coalesce across ALL events newest-first: a drifted latest
  // payload must not hide a name/job number that the job's older events
  // still carry.
  const payloadField = (key: string): string | null => {
    for (const event of events) {
      const value = event.payload[key];
      if (isText(value)) return value;
    }
    return null;
  };

  return {
    jobId,
    jobNumber: payloadField('job_number'),
    technicianName: payloadField('technician_name'),
    events,
    currentStep,
    currentStage,
    isCompleted,
    stages,
    isUnread: unreadIds.length > 0,
    unreadIds,
    latestCreatedAt: latest.createdAt,
  };
}

/** The card's title line: "{technician_name} · {job_number}", or generic. */
export function cardTitle(card: Pick<NotificationCardData, 'jobNumber' | 'technicianName'>): string {
  if (card.jobNumber === null || card.technicianName === null) return CARD_FALLBACK_TITLE;
  return `${card.technicianName} · ${card.jobNumber}`;
}

/**
 * Narrow the card list by the chip row's selection. Completed = the job
 * reached a terminal step (`isCompleted`) — never the display stage, which
 * photos/signature reach mid-completion-flow.
 */
export function filterCards(
  cards: NotificationCardData[],
  filter: NotificationFilter,
): NotificationCardData[] {
  if (filter === 'all') return cards;
  return cards.filter(card => (filter === 'completed' ? card.isCompleted : !card.isCompleted));
}
