/**
 * notificationCardModel.test.ts — the pure grouping/stage/filter logic behind
 * the redesigned notifications screen: per-job grouping and order, the
 * 4-display-stage folding (photos/signature → Completed), stage timestamps,
 * status mapping, unread aggregation, title fallback and filter buckets.
 */
import type { ApiNotification } from '../../services';
import {
  cardTitle,
  filterCards,
  groupNotificationsByJob,
  stepStatusKey,
} from './notificationCardModel';

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
    const cards = groupNotificationsByJob([
      makeNotification('n1', { jobId: 'job-a' }),
      makeNotification('n2', { jobId: 'job-b' }),
      makeNotification('n3', { jobId: 'job-a' }),
    ]);
    expect(cards.map(c => c.jobId)).toEqual(['job-a', 'job-b']);
    expect(cards[0].events.map(e => e.id)).toEqual(['n1', 'n3']);
    // events[0] is the newest event of the job.
    expect(cards[0].currentStep).toBe('on_my_way');
    expect(cards[0].latestCreatedAt).toBe('2026-09-09T12:00:00Z');
  });

  it('carries payload display fields and aggregates unread state', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n1', { jobId: 'job-a' }),
      makeNotification('n2', {
        jobId: 'job-a',
        readAt: '2026-09-09T12:00:00Z',
        payload: { job_number: 'JB-2026-0042', step: 'arrived', technician_name: 'Priya' },
      }),
    ]);
    const card = cards[0];
    expect(card.jobNumber).toBe('JB-2026-0042');
    expect(card.technicianName).toBe('Priya');
    expect(card.isUnread).toBe(true);
    expect(card.unreadIds).toEqual(['n1']);
  });

  it('a job with only read events is not unread', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n1', { readAt: '2026-09-09T12:00:00Z' }),
    ]);
    expect(cards[0].isUnread).toBe(false);
    expect(cards[0].unreadIds).toEqual([]);
  });

  it('drifted payload fields degrade to null (generic copy, neutral banner)', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n1', { payload: { step: 42 } }),
    ]);
    const card = cards[0];
    expect(card.jobNumber).toBeNull();
    expect(card.technicianName).toBeNull();
    expect(card.currentStep).toBeNull();
    expect(card.currentStage).toBeNull();
    expect(card.isCompleted).toBe(false);
    expect(cardTitle(card)).toBe('Job status updated');
  });

  it('display fields coalesce across events newest-first', () => {
    // A drifted LATEST payload must not hide a name/job number the job's
    // older events still carry.
    const cards = groupNotificationsByJob([
      makeNotification('n2', {
        payload: { step: 'in_progress' },
        createdAt: '2026-09-09T12:40:00Z',
      }),
      makeNotification('n1', {
        createdAt: '2026-09-09T12:30:00Z',
      }),
    ]);
    const card = cards[0];
    expect(card.jobNumber).toBe('JB-2026-0042');
    expect(card.technicianName).toBe('Priya');
    expect(cardTitle(card)).toBe('Priya · JB-2026-0042');
  });
});

describe('stage derivation', () => {
  it('derives the four stages with timestamps from the job\'s events', () => {
    const cards = groupNotificationsByJob([
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
    ]);
    const card = cards[0];
    expect(card.currentStage).toBe('completed');
    expect(card.isCompleted).toBe(true);
    expect(card.stages.map(s => s.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
    ]);
    expect(card.stages.map(s => s.reachedAt)).toEqual([
      '2026-09-09T12:10:00Z',
      '2026-09-09T12:20:00Z',
      '2026-09-09T12:30:00Z',
      '2026-09-09T12:40:00Z',
    ]);
  });

  it('folds photos_uploaded and signature_captured into the Completed stage', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n2', {
        payload: { job_number: 'JB-1', step: 'signature_captured', technician_name: 'Priya' },
      }),
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
      }),
    ]);
    const card = cards[0];
    // Signature is the latest event, so the current stage is Completed —
    // but the job is NOT finished (no terminal step yet): mid-completion-flow.
    expect(card.currentStage).toBe('completed');
    expect(card.isCompleted).toBe(false);
    const completedStage = card.stages.find(s => s.key === 'completed');
    expect(completedStage?.state).toBe('current');
    // In progress is behind it — done, not current.
    const progressStage = card.stages.find(s => s.key === 'in_progress');
    expect(progressStage?.state).toBe('done');
  });

  it('unreached stages are pending and a partially loaded history still renders', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
      }),
    ]);
    const card = cards[0];
    expect(card.stages.map(s => s.state)).toEqual([
      'pending',
      'pending',
      'current',
      'pending',
    ]);
    expect(card.stages[0].reachedAt).toBeNull();
    expect(card.stages[3].reachedAt).toBeNull();
  });

  it('a stage reached by multiple events stamps the EARLIEST one', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n2', {
        payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:30:00Z',
      }),
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:10:00Z',
      }),
    ]);
    expect(cards[0].stages.find(s => s.key === 'in_progress')?.reachedAt).toBe(
      '2026-09-09T12:10:00Z',
    );
  });

  it('an out-of-order list still picks the newest event as current', () => {
    // The store trusts the server's sort — the model must not.
    const cards = groupNotificationsByJob([
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'on_my_way', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:10:00Z',
      }),
      makeNotification('n2', {
        payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:40:00Z',
      }),
    ]);
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
      'current',
    ]);
  });

  it('a stage reached beyond the current one renders pending, not done', () => {
    // Latest event says "arrived" but an older one says "completed" — the
    // timeline must never claim the job got further than its current step.
    const cards = groupNotificationsByJob([
      makeNotification('n2', {
        payload: { job_number: 'JB-1', step: 'arrived', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:40:00Z',
      }),
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'completed', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:10:00Z',
      }),
    ]);
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
    const driftLatest = groupNotificationsByJob([
      ...finished,
      makeNotification('n2', { payload: {}, createdAt: '2026-09-09T12:40:00Z' }),
    ])[0];
    expect(driftLatest.currentStep).toBeNull();
    expect(driftLatest.isCompleted).toBe(true);

    const unknownLatest = groupNotificationsByJob([
      ...finished,
      makeNotification('n3', {
        payload: { job_number: 'JB-1', step: 'some_new_step', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:40:00Z',
      }),
    ])[0];
    expect(unknownLatest.currentStep).toBe('some_new_step');
    expect(unknownLatest.isCompleted).toBe(true);
    // The unknown-step fallback still pins "current" on the latest stage
    // reached — the Completed stage — so the card renders coherently.
    expect(unknownLatest.stages.find(s => s.key === 'completed')?.state).toBe('current');
  });

  it('an unknown current step pins "current" on the latest stage reached', () => {
    // A brand-new server step maps to no display stage — the banner goes
    // neutral, but the timeline must still show where the job is.
    const cards = groupNotificationsByJob([
      makeNotification('n2', {
        payload: { job_number: 'JB-1', step: 'paused', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:40:00Z',
      }),
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'in_progress', technician_name: 'Priya' },
        createdAt: '2026-09-09T12:30:00Z',
      }),
    ]);
    const card = cards[0];
    expect(card.currentStep).toBe('paused');
    expect(card.currentStage).toBeNull();
    expect(card.stages.map(s => s.state)).toEqual([
      'pending',
      'pending',
      'current',
      'pending',
    ]);
  });
});

describe('stepStatusKey', () => {
  it('maps the known steps onto the Fenzit status families', () => {
    expect(stepStatusKey('on_my_way')).toBe('scheduled');
    expect(stepStatusKey('arrived')).toBe('scheduled');
    expect(stepStatusKey('in_progress')).toBe('progress');
    expect(stepStatusKey('photos_uploaded')).toBe('progress');
    expect(stepStatusKey('signature_captured')).toBe('progress');
    expect(stepStatusKey('completed')).toBe('done');
  });

  it('unknown or missing steps fall back to neutral', () => {
    expect(stepStatusKey('something_new')).toBe('neutral');
    expect(stepStatusKey(null)).toBe('neutral');
  });
});

describe('filterCards', () => {
  const completed = makeNotification('n1', {
    payload: { job_number: 'JB-1', step: 'completed', technician_name: 'P' },
  });
  const active = makeNotification('n2', { jobId: 'job-b' });

  it('partitions by terminal step, not by display stage', () => {
    const cards = groupNotificationsByJob([completed, active]);
    expect(filterCards(cards, 'all').map(c => c.jobId)).toEqual(['job-1', 'job-b']);
    expect(filterCards(cards, 'completed').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-b']);
  });

  it('signature_captured and photos_uploaded fold into the Completed display stage but stay ACTIVE', () => {
    // Photos/signature belong to the completion flow — only the terminal
    // `completed` step puts a job in the Completed chip.
    for (const step of ['photos_uploaded', 'signature_captured']) {
      const signing = makeNotification('n3', {
        jobId: 'job-c',
        payload: { job_number: 'JB-2', step, technician_name: 'P' },
      });
      const cards = groupNotificationsByJob([signing]);
      expect(cards[0].currentStage).toBe('completed');
      expect(cards[0].isCompleted).toBe(false);
      expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-c']);
      expect(filterCards(cards, 'completed')).toEqual([]);
    }
  });

  it('a drifted card (unknown stage) counts as active', () => {
    const drifted = makeNotification('n3', { payload: {} });
    const cards = groupNotificationsByJob([drifted]);
    expect(filterCards(cards, 'active').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'completed')).toEqual([]);
  });

  it('a finished job with a drifted latest event stays in the Completed chip', () => {
    const cards = groupNotificationsByJob([
      makeNotification('n1', {
        payload: { job_number: 'JB-1', step: 'completed', technician_name: 'P' },
        createdAt: '2026-09-09T12:10:00Z',
      }),
      makeNotification('n2', { payload: {}, createdAt: '2026-09-09T12:40:00Z' }),
    ]);
    expect(filterCards(cards, 'completed').map(c => c.jobId)).toEqual(['job-1']);
    expect(filterCards(cards, 'active')).toEqual([]);
  });

  it('a future unknown step also counts as active (fails safe)', () => {
    const future = makeNotification('n4', {
      jobId: 'job-d',
      payload: { job_number: 'JB-3', step: 'some_new_step', technician_name: 'P' },
    });
    const cards = groupNotificationsByJob([future]);
    expect(cards[0].isCompleted).toBe(false);
    // No stage was ever reached, so the fallback pins nothing — every stage
    // renders pending (the banner goes neutral, nothing looks "done").
    expect(cards[0].stages.map(s => s.state)).toEqual([
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
