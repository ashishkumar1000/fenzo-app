/**
 * notificationCardModel.test.ts — the pure grouping/stage/filter logic behind
 * the redesigned notifications screen: per-job grouping and order, the
 * DYNAMIC display stages (Story 4.5 — one stage per template step, no
 * hardcoded folding), stage timestamps, status mapping, unread aggregation,
 * title fallback and filter buckets.
 */
import type { ApiNotification } from '../../services';
import type { WorkflowTemplateStep } from '../../services/resources/jobs';
import {
  cardTitle,
  filterCards,
  groupNotificationsByJob,
  stepStatusKey,
} from './notificationCardModel';

/** Story 4.5 dynamic template fixture — every stage comes from template
 * steps; the terminal step is the one with setsStatus 'completed'. */
function templateStep(
  key: string,
  label: string,
  setsStatus: string | null,
): WorkflowTemplateStep {
  return {
    key,
    label,
    requiresPhoto: false,
    requiresSignature: false,
    requiresLocation: false,
    setsStatus,
    advancesOn: null,
  };
}

const TEMPLATE_STEPS: WorkflowTemplateStep[] = [
  templateStep('on_my_way', 'On my way', null),
  templateStep('arrived', 'Arrived', null),
  templateStep('in_progress', 'In progress', 'in_progress'),
  templateStep('signature_captured', 'Signature captured', null),
  templateStep('completed', 'Completed', 'completed'),
];

/** The lookup shape `useJobTemplateCache` hands the screen. */
const getTemplate = (_jobId: string) => TEMPLATE_STEPS;

function makeNotification(
  id: string,
  overrides: Partial<ApiNotification> = {},
  payloadOverrides: Record<string, unknown> = {},
): ApiNotification {
  return {
    id,
    jobId: 'job-1',
    eventType: 'on_my_way',
    payload: {
      job_number: 'JB-2026-0042',
      step: 'on_my_way',
      technician_name: 'Priya',
      ...payloadOverrides,
    },
    readAt: null,
    createdAt: '2026-09-09T12:00:00Z',
    ...overrides,
  };
}

describe('groupNotificationsByJob', () => {
  it('groups events per job, card order = first appearance (newest first)', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n1', { jobId: 'job-a' }),
        makeNotification('n2', { jobId: 'job-b' }),
        makeNotification('n3', { jobId: 'job-a' }),
      ],
      getTemplate,
    );
    expect(cards.map(c => c.jobId)).toEqual(['job-a', 'job-b']);
    expect(cards[0].events.map(e => e.id)).toEqual(['n1', 'n3']);
    // events[0] is the newest event of the job.
    expect(cards[0].currentStep).toBe('on_my_way');
    expect(cards[0].latestCreatedAt).toBe('2026-09-09T12:00:00Z');
  });

  it('carries payload display fields and aggregates unread state', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n1', { jobId: 'job-a' }),
        makeNotification('n2', {
          jobId: 'job-a',
          readAt: '2026-09-09T12:00:00Z',
          payload: { job_number: 'JB-2026-0042', step: 'arrived', technician_name: 'Priya' },
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.jobNumber).toBe('JB-2026-0042');
    expect(card.technicianName).toBe('Priya');
    expect(card.isUnread).toBe(true);
    expect(card.unreadIds).toEqual(['n1']);
  });

  it('a job with only read events is not unread', () => {
    const cards = groupNotificationsByJob(
      [makeNotification('n1', { readAt: '2026-09-09T12:00:00Z' })],
      getTemplate,
    );
    expect(cards[0].isUnread).toBe(false);
    expect(cards[0].unreadIds).toEqual([]);
  });

  it('drifted payload fields degrade to null (generic copy, neutral banner)', () => {
    const cards = groupNotificationsByJob(
      [makeNotification('n1', { payload: { step: 42 } })],
      getTemplate,
    );
    const card = cards[0];
    expect(card.jobNumber).toBeNull();
    expect(card.technicianName).toBeNull();
    expect(card.currentStep).toBeNull();
    expect(card.isCompleted).toBe(false);
    expect(cardTitle(card)).toBe('Job status updated');
  });

  it('display fields coalesce across events newest-first', () => {
    // A drifted LATEST payload must not hide a name/job number the job's
    // older events still carry.
    const cards = groupNotificationsByJob(
      [
        makeNotification('n2', {
          payload: { step: 'in_progress' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
        makeNotification('n1', {
          createdAt: '2026-09-09T12:30:00Z',
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.jobNumber).toBe('JB-2026-0042');
    expect(card.technicianName).toBe('Priya');
    expect(cardTitle(card)).toBe('Priya · JB-2026-0042');
  });
});

describe('template lookup', () => {
  it('a null template renders the degraded card: no stages, neutral, templateSteps null', () => {
    // What the screen shows while useJobTemplateCache is still fetching
    // (or when the job has no template) — the card must not crash or invent
    // stages; the display fields still coalesce from the events.
    const cards = groupNotificationsByJob([makeNotification('n1')], () => null);
    const card = cards[0];
    expect(card.templateSteps).toBeNull();
    expect(card.stages).toEqual([]);
    expect(card.currentStage).toBeNull();
    expect(card.currentStep).toBe('on_my_way');
    expect(card.isCompleted).toBe(false);
    expect(card.jobNumber).toBe('JB-2026-0042');
    expect(card.technicianName).toBe('Priya');
    expect(cardTitle(card)).toBe('Priya · JB-2026-0042');
  });

  it('carries the template steps the card banner and stepper derive from', () => {
    const cards = groupNotificationsByJob([makeNotification('n1')], getTemplate);
    expect(cards[0].templateSteps).toBe(TEMPLATE_STEPS);
  });
});

describe('stage derivation', () => {
  it('derives one stage per template step, with timestamps from the job\'s events', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n4', {
          payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
        makeNotification('n3', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:30:00Z',
        }),
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'arrived', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:20:00Z',
        }),
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'on_my_way', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:10:00Z',
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.currentStage).toBe('completed');
    expect(card.isCompleted).toBe(true);
    expect(card.stages.map(s => s.state)).toEqual([
      'done',
      'done',
      'done',
      'pending',
      'current',
    ]);
    expect(card.stages.map(s => s.reachedAt)).toEqual([
      '2026-09-09T12:10:00Z',
      '2026-09-09T12:20:00Z',
      '2026-09-09T12:30:00Z',
      null,
      '2026-09-09T12:40:00Z',
    ]);
  });

  it('stages carry the template\'s labels, not hardcoded copy', () => {
    const cards = groupNotificationsByJob([makeNotification('n1')], getTemplate);
    expect(cards[0].stages.map(s => s.label)).toEqual([
      'On my way',
      'Arrived',
      'In progress',
      'Signature captured',
      'Completed',
    ]);
  });

  it('signature_captured is its own stage — completion is the terminal step only', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'signature_captured', technician_name: 'Priya' },
        }),
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    // Signature is the latest event, so the current stage is Signature
    // captured — the job is NOT finished (no terminal step yet):
    // mid-completion-flow.
    expect(card.currentStage).toBe('signature_captured');
    expect(card.isCompleted).toBe(false);
    expect(card.stages.find(s => s.key === 'signature_captured')?.state).toBe('current');
    // In progress is behind it — done, not current.
    expect(card.stages.find(s => s.key === 'in_progress')?.state).toBe('done');
    // The terminal stage was never reached.
    expect(card.stages.find(s => s.key === 'completed')?.state).toBe('pending');
  });

  it('unreached stages are pending and a partially loaded history still renders', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.stages.map(s => s.state)).toEqual([
      'pending',
      'pending',
      'current',
      'pending',
      'pending',
    ]);
    expect(card.stages[0].reachedAt).toBeNull();
    expect(card.stages[4].reachedAt).toBeNull();
  });

  it('a stage reached by multiple events stamps the EARLIEST one', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:30:00Z',
        }),
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:10:00Z',
        }),
      ],
      getTemplate,
    );
    expect(cards[0].stages.find(s => s.key === 'in_progress')?.reachedAt).toBe(
      '2026-09-09T12:10:00Z',
    );
  });

  it('an out-of-order list still picks the newest event as current', () => {
    // The store trusts the server's sort — the model must not.
    const cards = groupNotificationsByJob(
      [
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'on_my_way', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:10:00Z',
        }),
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.currentStep).toBe('completed');
    expect(card.currentStage).toBe('completed');
    expect(card.isCompleted).toBe(true);
    expect(card.latestCreatedAt).toBe('2026-09-09T12:40:00Z');
    // Only on_my_way and completed have events — the middle stages are
    // pending (never reached in this fixture), not done.
    expect(card.stages.map(s => s.state)).toEqual([
      'done',
      'pending',
      'pending',
      'pending',
      'current',
    ]);
  });

  it('a stage reached beyond the current one renders pending, not done', () => {
    // Latest event says "arrived" but an older one says "completed" — the
    // timeline must never claim the job got further than its current step.
    const cards = groupNotificationsByJob(
      [
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'arrived', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:10:00Z',
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.currentStage).toBe('arrived');
    const completed = card.stages.find(s => s.key === 'completed');
    expect(completed?.reachedAt).not.toBeNull(); // an event reached it…
    expect(completed?.state).toBe('pending'); // …but it is not "done"
    expect(card.stages.find(s => s.key === 'arrived')?.state).toBe('current');
    // The job DID complete once — completion coalesces across events, so it
    // stays `isCompleted` (Completed chip) even though the timeline renders
    // arrived as current (out-of-order events never claim further than the
    // current step).
    expect(card.isCompleted).toBe(true);
  });

  it('a finished job stays finished when its latest event drifts or is a future step', () => {
    // Completion coalesces across ALL events — a drifted/unknown LATEST
    // payload must not un-finish a job whose history carries the terminal
    // step (the coalesce rule the display fields already follow).
    const finished = [
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:10:00Z',
      }),
    ];
    const driftLatest = groupNotificationsByJob(
      [
        ...finished,
        makeNotification('n2', { payload: {}, createdAt: '2026-09-09T12:40:00Z' }),
      ],
      getTemplate,
    )[0];
    expect(driftLatest.currentStep).toBeNull();
    expect(driftLatest.isCompleted).toBe(true);

    const unknownLatest = groupNotificationsByJob(
      [
        ...finished,
        makeNotification('n3', {
          payload: { job_number: 'JB-1', step: 'some_new_step', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
      ],
      getTemplate,
    )[0];
    expect(unknownLatest.currentStep).toBe('some_new_step');
    expect(unknownLatest.isCompleted).toBe(true);
    // The unknown-step fallback still pins "current" on the latest stage
    // reached — the Completed stage — so the card renders coherently.
    expect(unknownLatest.stages.find(s => s.key === 'completed')?.state).toBe('current');
  });

  it('an unknown current step pins "current" on the latest stage reached', () => {
    // A brand-new server step maps to no display stage — the banner goes
    // neutral, but the timeline must still show where the job is.
    const cards = groupNotificationsByJob(
      [
        makeNotification('n2', {
          payload: { job_number: 'JB-1', step: 'paused', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:40:00Z',
        }),
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
          createdAt: '2026-09-09T12:30:00Z',
        }),
      ],
      getTemplate,
    );
    const card = cards[0];
    expect(card.currentStep).toBe('paused');
    expect(card.currentStage).toBeNull();
    expect(card.stages.map(s => s.state)).toEqual([
      'pending',
      'pending',
      'current',
      'pending',
      'pending',
    ]);
  });
});

describe('stepStatusKey', () => {
  it('derives the status family from the template step\'s setsStatus', () => {
    expect(stepStatusKey('on_my_way', TEMPLATE_STEPS)).toBe('scheduled');
    expect(stepStatusKey('arrived', TEMPLATE_STEPS)).toBe('scheduled');
    expect(stepStatusKey('in_progress', TEMPLATE_STEPS)).toBe('progress');
    expect(stepStatusKey('signature_captured', TEMPLATE_STEPS)).toBe('scheduled');
    expect(stepStatusKey('completed', TEMPLATE_STEPS)).toBe('done');
  });

  it('unknown, missing, or template-less steps fall back to neutral', () => {
    expect(stepStatusKey('something_new', TEMPLATE_STEPS)).toBe('neutral');
    expect(stepStatusKey(null, TEMPLATE_STEPS)).toBe('neutral');
    expect(stepStatusKey('completed', null)).toBe('neutral');
  });
});

describe('filterCards', () => {
  const completed = makeNotification('n1', {
    payload: { job_number: 'JB-1', step: 'completed', technician_name: 'P' },
  });
  const active = makeNotification('n2', { jobId: 'job-b' });

  it('partitions by terminal step, not by display stage', () => {
    const cards = groupNotificationsByJob([completed, active], getTemplate);
    expect(filterCards(cards, 'all').map(c => c.jobId)).toEqual(['job-1', 'job-b']);
    expect(filterCards(cards, 'completed').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-b']);
  });

  it('a signature_captured current stage is its own stage and stays ACTIVE', () => {
    // Only the template's terminal step (setsStatus 'completed') puts a job
    // in the Completed chip — signature is mid-completion-flow.
    const signing = makeNotification('n3', {
      jobId: 'job-c',
      payload: { job_number: 'JB-2', step: 'signature_captured', technician_name: 'P' },
    });
    const cards = groupNotificationsByJob([signing], getTemplate);
    expect(cards[0].currentStage).toBe('signature_captured');
    expect(cards[0].isCompleted).toBe(false);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-c']);
    expect(filterCards(cards, 'completed')).toEqual([]);
  });

  it('a drifted card (unknown stage) counts as active', () => {
    const drifted = makeNotification('n3', { payload: {} });
    const cards = groupNotificationsByJob([drifted], getTemplate);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'completed')).toEqual([]);
  });

  it('a finished job with a drifted latest event stays in the Completed chip', () => {
    const cards = groupNotificationsByJob(
      [
        makeNotification('n1', {
          payload: { job_number: 'JB-1', step: 'completed', technician_name: 'P' },
          createdAt: '2026-09-09T12:10:00Z',
        }),
        makeNotification('n2', { payload: {}, createdAt: '2026-09-09T12:40:00Z' }),
      ],
      getTemplate,
    );
    expect(filterCards(cards, 'completed').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'active')).toEqual([]);
  });

  it('a future unknown step also counts as active (fails safe)', () => {
    const future = makeNotification('n4', {
      jobId: 'job-d',
      payload: { job_number: 'JB-3', step: 'some_new_step', technician_name: 'P' },
    });
    const cards = groupNotificationsByJob([future], getTemplate);
    expect(cards[0].isCompleted).toBe(false);
    // No stage was ever reached, so the fallback pins nothing — every stage
    // renders pending (the banner goes neutral, nothing looks "done").
    expect(cards[0].stages.map(s => s.state)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-d']);
    expect(filterCards(cards, 'completed')).toEqual([]);
  });
});

describe('cardTitle', () => {
  it('collapses a partial payload to the generic copy (banner-model rule)', () => {
    expect(cardTitle({ jobNumber: 'JB-1', technicianName: null })).toBe('Job status updated');
    expect(cardTitle({ jobNumber: null, technicianName: 'Priya' })).toBe('Job status updated');
    expect(cardTitle({ jobNumber: 'JB-1', technicianName: 'Priya' })).toBe('Priya · JB-1');
  });
});