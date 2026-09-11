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
 * Display stages are NOW DYNAMIC: built from the job's stamped workflow
 * template steps (Story 4.5). Each skill's template determines the stage
 * chain and labels. Completion is its own ground truth: `TERMINAL_STEPS`
 * (the `completed` step) drives the Completed filter chip and the stepper's
 * done-glyph — reaching the final stage via intermediate steps is still
 * mid-completion-flow, i.e. Active.
 */
import type { ApiNotification } from '../../services';
import type { StatusKey } from '../../theme';
import type { WorkflowTemplateStep } from '../../services/resources/jobs';

export type DisplayStageKey = string;

export interface DisplayStage {
  key: string;
  label: string;
  steps: string[];
}

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
   * Completed filter and the stepper's done-glyph, NOT `currentStage`.
   * Coalesced across ALL events: a drifted/unknown latest payload cannot
   * un-finish a job whose history carries the terminal step.
   */
  isCompleted: boolean;
  stages: CardStage[];
  isUnread: boolean;
  unreadIds: string[];
  latestCreatedAt: string;
  /** Workflow template steps (for status derivation) — null if not available. */
  templateSteps: WorkflowTemplateStep[] | null;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Build display stages from workflow template steps (Story 4.5 dynamic).
 * Each step in the template becomes a display stage with the step's label.
 */
function buildDisplayStages(templateSteps: WorkflowTemplateStep[]): DisplayStage[] {
  return templateSteps.map(step => ({
    key: step.key,
    label: step.label,
    steps: [step.key],
  }));
}

/** A job is finished only when its current step has sets_status = 'completed'. */
function isTerminalStep(step: string | null, templateSteps: WorkflowTemplateStep[]): boolean {
  if (step === null) return false;
  return templateSteps.some(s => s.key === step && s.setsStatus === 'completed');
}

/**
 * Status family for the banner of a card whose current step is `step`.
 * Derived from the step's `setsStatus` field: 'completed' → done,
 * 'in_progress' → progress, null → scheduled/neutral.
 */
export function stepStatusKey(
  step: string | null,
  templateSteps: WorkflowTemplateStep[] | null,
): StatusKey {
  if (step === null || !templateSteps) return 'neutral';
  const templateStep = templateSteps.find(s => s.key === step);
  if (!templateStep) return 'neutral';

  switch (templateStep.setsStatus) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'progress';
    default:
      return 'scheduled';
  }
}

/** A notification's raw workflow step; null when missing/unknown shape. */
const stepOfEvent = (n: ApiNotification): string | null =>
  isText(n.payload.step) ? n.payload.step : null;

/**
 * Groups the flat newest-first list into one card per job. Card order is
 * first appearance — the store's newest-first sort, untouched.
 *
 * Requires a template lookup function: `getTemplate(jobId)` returns the
 * workflow template steps for that job, or null if not available.
 */
export function groupNotificationsByJob(
  items: ApiNotification[],
  getTemplate: (jobId: string) => WorkflowTemplateStep[] | null,
): NotificationCardData[] {
  const byJob = new Map<string, ApiNotification[]>();
  for (const n of items) {
    const group = byJob.get(n.jobId);
    if (group) group.push(n);
    else byJob.set(n.jobId, [n]);
  }
  return [...byJob.entries()].map(([jobId, events]) => buildCard(jobId, events, getTemplate));
}

function buildCard(
  jobId: string,
  events: ApiNotification[],
  getTemplate: (jobId: string) => WorkflowTemplateStep[] | null,
): NotificationCardData {
  const latest = events.reduce((a, b) =>
    Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a,
  );
  const currentStep = stepOfEvent(latest);

  // Fetch the job's workflow template to build dynamic stages.
  const templateSteps = getTemplate(jobId);
  const displayStages = templateSteps ? buildDisplayStages(templateSteps) : [];

  // Completion: terminal step ('completed' setsStatus).
  const isCompleted =
    (templateSteps && isTerminalStep(currentStep, templateSteps)) ||
    (templateSteps && events.some(e => isTerminalStep(stepOfEvent(e), templateSteps))) ||
    false;

  const currentStageIndex = displayStages.findIndex(s => s.key === currentStep);
  const earliest = (a: string, b: string) => (Date.parse(a) <= Date.parse(b) ? a : b);

  const stages: CardStage[] = displayStages.map((stage, index) => {
    // Earliest `createdAt` for this step.
    let reachedAt: string | null = null;
    for (const event of events) {
      const step = stepOfEvent(event);
      if (step !== null && (stage.steps as readonly string[]).includes(step)) {
        reachedAt = reachedAt === null ? event.createdAt : earliest(reachedAt, event.createdAt);
      }
    }

    // State: pending if not reached or beyond current; done if behind; current if at.
    const state: CardStage['state'] =
      reachedAt === null || (currentStageIndex >= 0 && index > currentStageIndex)
        ? 'pending'
        : index === currentStageIndex
          ? 'current'
          : 'done';
    return { key: stage.key, label: stage.label, reachedAt, state };
  });

  // Fallback: if no template, show generic "Job status updated".
  if (displayStages.length === 0) {
    const unreadIds = events.filter(n => n.readAt === null).map(n => n.id);
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
      currentStage: null,
      isCompleted,
      stages: [],
      isUnread: unreadIds.length > 0,
      unreadIds,
      latestCreatedAt: latest.createdAt,
      templateSteps: null,
    };
  }

  // Unknown current step: fall back to latest reached stage.
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
    currentStage: displayStages[currentStageIndex]?.key ?? null,
    isCompleted,
    stages,
    isUnread: unreadIds.length > 0,
    unreadIds,
    latestCreatedAt: latest.createdAt,
    templateSteps: templateSteps ?? null,
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
