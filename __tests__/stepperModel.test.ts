/**
 * Stepper derivation (`src/features/technicianApp/stepperModel.ts`) — every
 * state the six-step workflow can present, plus the invariants the screen
 * depends on: exactly one `next` on active jobs, none on terminal ones, and
 * the photo-skip rule mirrored from the backend's workflow service.
 */
import { buildStepper, STEP_ORDER, type StepperJob } from '../src/features/technicianApp/stepperModel';
import { STEP_LABELS, STEP_ORDER as EVENT_STEP_ORDER } from '../src/features/jobDetail/eventLabels';
import type { ActivityLogEntry } from '../src/services';

const job = (over: Partial<StepperJob>): StepperJob => ({
  currentStep: null,
  requireCompletionPhoto: true,
  status: 'scheduled',
  ...over,
});

/** Minimal activity-log builder — only `eventType`/`createdAt` matter here. */
const entry = (eventType: string, createdAt = '2026-09-04T06:30:00Z'): ActivityLogEntry => ({
  id: `${eventType}-id`,
  eventType,
  actorId: null,
  metadata: null,
  createdAt,
});

const LOG = STEP_ORDER.map(step => entry(`step_${step}`));

const statesOf = (job0: StepperJob, log: ActivityLogEntry[] = LOG) =>
  buildStepper(job0, log).map(v => v.state);

describe('buildStepper', () => {
  it('fresh job (currentStep null) → on_my_way is the only next', () => {
    const views = buildStepper(job({}), LOG);
    expect(views.map(v => v.state)).toEqual([
      'next',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
  });

  it('fresh job → the rest are locked even with a log present', () => {
    const views = buildStepper(job({}), LOG);
    expect(views.filter(v => v.state === 'done')).toHaveLength(0);
  });

  it('currentStep on_my_way → on_my_way done (with timestamp), arrived next', () => {
    const views = buildStepper(
      job({ currentStep: 'on_my_way', status: 'in_progress' }),
      LOG,
    );
    expect(views[0]).toMatchObject({ state: 'done', timestamp: LOG[0].createdAt });
    expect(views[1].state).toBe('next');
    expect(views.slice(2).every(v => v.state === 'locked')).toBe(true);
  });

  it('each mid-state marks everything at-or-before currentStep done', () => {
    expect(
      statesOf(job({ currentStep: 'arrived', status: 'in_progress' })),
    ).toEqual(['done', 'done', 'next', 'locked', 'locked', 'locked']);
    expect(
      statesOf(job({ currentStep: 'in_progress', status: 'in_progress' })),
    ).toEqual(['done', 'done', 'done', 'next', 'locked', 'locked']);
  });

  it('photos required + in_progress → photos_uploaded is next', () => {
    expect(
      statesOf(job({ currentStep: 'in_progress', status: 'in_progress' })),
    ).toEqual(['done', 'done', 'done', 'next', 'locked', 'locked']);
  });

  it('photos NOT required + in_progress → photos skipped, signature next', () => {
    expect(
      statesOf(
        job({ currentStep: 'in_progress', status: 'in_progress', requireCompletionPhoto: false }),
      ),
    ).toEqual(['done', 'done', 'done', 'skipped', 'next', 'locked']);
  });

  it('photos NOT required but a photos entry was logged → done steps stay done after passing it', () => {
    expect(
      statesOf(
        job({ currentStep: 'signature_captured', status: 'in_progress', requireCompletionPhoto: false }),
        LOG,
      ),
    ).toEqual(['done', 'done', 'done', 'done', 'done', 'next']);
  });

  it('photos NOT required + passed without a log entry → photos shows skipped, not done', () => {
    const views = buildStepper(
      job({ currentStep: 'signature_captured', status: 'in_progress', requireCompletionPhoto: false }),
      LOG.filter(e => e.eventType !== 'step_photos_uploaded'),
    );
    expect(views[3]).toMatchObject({ state: 'skipped', timestamp: null });
  });

  it('completed job → all done or skipped, no next', () => {
    expect(
      statesOf(job({ currentStep: 'completed', status: 'completed' })),
    ).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
    expect(
      statesOf(
        job({ currentStep: 'completed', status: 'completed', requireCompletionPhoto: false }),
        LOG.filter(e => e.eventType !== 'step_photos_uploaded'),
      ),
    ).toEqual(['done', 'done', 'done', 'skipped', 'done', 'done']);
  });

  it('cancelled mid-way → no next, remaining steps locked', () => {
    expect(
      statesOf(job({ currentStep: 'arrived', status: 'cancelled' })),
    ).toEqual(['done', 'done', 'locked', 'locked', 'locked', 'locked']);
  });

  it('cancelled fresh (no steps taken) → all locked', () => {
    expect(
      statesOf(job({ status: 'cancelled' })),
    ).toEqual(['locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });

  it('timestamps come from the matching step_* log entry and are null without one', () => {
    const at = '2026-09-04T07:15:00Z';
    const views = buildStepper(
      job({ currentStep: 'arrived', status: 'in_progress' }),
      [entry('step_on_my_way', at)],
    );
    expect(views[0].timestamp).toBe(at);
    expect(views[1].timestamp).toBeNull();
  });

  it('a step log entry without its step reached yet does not mark it done', () => {
    // A log can only be ahead of currentStep through sync lag — the
    // derivation must trust currentStep, not the log.
    const views = buildStepper(
      job({ currentStep: null, status: 'in_progress' }),
      LOG,
    );
    expect(views.every(v => v.state !== 'done')).toBe(true);
  });

  it('invariant: exactly one next on every active (non-terminal) state', () => {
    const nonTerminal: StepperJob[] = [];
    STEP_ORDER.forEach((_, curIdx) => {
      nonTerminal.push(
        job({ currentStep: STEP_ORDER[curIdx - 1] ?? null, status: 'in_progress', requireCompletionPhoto: true }),
        job({ currentStep: STEP_ORDER[curIdx - 1] ?? null, status: 'in_progress', requireCompletionPhoto: false }),
        job({ currentStep: STEP_ORDER[curIdx - 1] ?? null, status: 'scheduled', requireCompletionPhoto: true }),
        job({ currentStep: STEP_ORDER[curIdx - 1] ?? null, status: 'scheduled', requireCompletionPhoto: false }),
      );
    });
    nonTerminal.forEach(j => {
      const nextCount = buildStepper(j, LOG).filter(v => v.state === 'next').length;
      expect(`${j.currentStep}/${j.requireCompletionPhoto}: ${nextCount}`).toBe(
        `${j.currentStep}/${j.requireCompletionPhoto}: 1`,
      );
    });
  });

  it('invariant: no next on terminal jobs', () => {
    (['completed', 'cancelled'] as const).forEach(status => {
      STEP_ORDER.forEach(currentStep => {
        const views = buildStepper(job({ currentStep, status }), LOG);
        expect(views.some(v => v.state === 'next')).toBe(false);
      });
    });
  });

  it('returns exactly six rows in STEP_ORDER', () => {
    const views = buildStepper(job({}), []);
    expect(views).toHaveLength(6);
    expect(views.map(v => v.step)).toEqual([...STEP_ORDER]);
  });
});

describe('STEP_ORDER vocabulary pin', () => {
  // The technician feature owns its own copy of the step order (so it does
  // not import across features), but the two MUST stay identical — a drift
  // would let the UI offer a step the server rejects.
  it('is identical to the owner-side eventLabels.STEP_ORDER', () => {
    expect([...STEP_ORDER]).toEqual([...EVENT_STEP_ORDER]);
  });

  it('has a display label for every step', () => {
    STEP_ORDER.forEach(step => {
      expect(STEP_LABELS[step]).toBeTruthy();
    });
  });
});
