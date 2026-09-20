/**
 * reportNotificationModel.test.ts — the pure card logic for Epic-12 report
 * notifications (`report_ready` / `report_failed`): event-type detection,
 * one-card-per-row building, payload-drift degradation, event-type
 * authority over payload.status, and the job/report card interleave.
 *
 * Same conventions as notificationCardModel.test.ts: pure fixtures, no
 * mocks, drift degrades — never crashes, never `undefined` on screen.
 */
import type { ApiNotification } from '../../services';
import type { NotificationCardData } from './notificationCardModel';
import { failedReportCopy } from '../reports/reportModel';
import {
  buildReportCards,
  isReportNotification,
  mergeNotificationCards,
  REPORT_FAILED_EVENT,
  REPORT_READY_EVENT,
} from './reportNotificationModel';

/** A report engine notification row: `job_id` NULL, report payload shape. */
function makeReportNotification(
  id: string,
  overrides: Partial<ApiNotification> = {},
  payloadOverrides: Record<string, unknown> = {},
): ApiNotification {
  return {
    id,
    jobId: null,
    eventType: REPORT_READY_EVENT,
    payload: {
      reportId: 'report-1',
      reportType: 'technician_job_activity',
      reportLabel: 'Technician Job Report',
      status: 'ready',
      ...payloadOverrides,
    },
    readAt: null,
    createdAt: '2026-09-09T12:00:00Z',
    ...overrides,
  };
}

/** Minimal job card for merge tests — only the merge-relevant fields matter. */
function makeJobCard(key: string, latestCreatedAt: string): NotificationCardData {
  return {
    kind: 'job',
    key,
    jobId: key,
    jobNumber: null,
    technicianName: null,
    events: [],
    currentStep: null,
    currentStage: null,
    isCompleted: false,
    stages: [],
    isUnread: false,
    unreadIds: [],
    latestCreatedAt,
    templateSteps: null,
  };
}

describe('isReportNotification', () => {
  it('is true for the report engine’s two terminal events', () => {
    expect(isReportNotification(makeReportNotification('r1', { eventType: 'report_ready' }))).toBe(true);
    expect(isReportNotification(makeReportNotification('r2', { eventType: 'report_failed' }))).toBe(true);
  });

  it('is false for job-step events and any other event type', () => {
    expect(isReportNotification(makeReportNotification('n1', { eventType: 'on_my_way', jobId: 'job-1' }))).toBe(false);
    expect(isReportNotification(makeReportNotification('n2', { eventType: 'completed', jobId: 'job-1' }))).toBe(false);
    expect(isReportNotification(makeReportNotification('n3', { eventType: 'signature_captured' }))).toBe(false);
    expect(isReportNotification(makeReportNotification('n4', { eventType: '' }))).toBe(false);
  });
});

describe('buildReportCards', () => {
  it('filters to report rows only and preserves the list’s newest-first order', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { createdAt: '2026-09-09T12:30:00Z' }),
      makeReportNotification('n1', { eventType: 'on_my_way', jobId: 'job-1' }),
      makeReportNotification('r2', { eventType: 'report_failed', createdAt: '2026-09-09T12:20:00Z' }),
      makeReportNotification('n2', { eventType: 'completed', jobId: 'job-2' }),
      makeReportNotification('r3', { createdAt: '2026-09-09T12:10:00Z' }),
    ]);
    expect(cards.map(c => c.key)).toEqual(['r1', 'r2', 'r3']);
    expect(cards.every(c => c.kind === 'report')).toBe(true);
  });

  it('builds one card per notification row — no grouping', () => {
    // Two ready events for the SAME report are two separate cards: a report
    // fires at most one terminal event, so there is nothing to group.
    const cards = buildReportCards([
      makeReportNotification('r1'),
      makeReportNotification('r2', {}, { reportId: 'report-1' }),
    ]);
    expect(cards.map(c => c.key)).toEqual(['r1', 'r2']);
  });
});

describe('buildReportCard (via buildReportCards) — ready event', () => {
  it('maps a ready row to its full card shape', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { createdAt: '2026-09-09T12:00:00Z' }),
    ]);
    expect(cards[0]).toEqual({
      kind: 'report',
      key: 'r1',
      reportId: 'report-1',
      reportLabel: 'Technician Job Report',
      isFailed: false,
      title: 'Report ready',
      message: 'Technician Job Report is ready to view.',
      statusKey: 'done',
      statusLabel: 'Ready',
      isUnread: true,
      unreadIds: ['r1'],
      latestCreatedAt: '2026-09-09T12:00:00Z',
    });
  });

  it('a read row is not unread: unreadIds empty, isUnread false', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { readAt: '2026-09-09T12:05:00Z' }),
    ]);
    expect(cards[0].isUnread).toBe(false);
    expect(cards[0].unreadIds).toEqual([]);
  });

  it('a missing label falls back to the generic ready copy', () => {
    const cards = buildReportCards([makeReportNotification('r1', {}, { reportLabel: undefined })]);
    expect(cards[0].message).toBe('Your report is ready to view.');
    expect(cards[0].reportLabel).toBeNull();
  });
});

describe('buildReportCard — failed event', () => {
  it('maps a failed row to the failed card shape with the error-code copy', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', {
        eventType: REPORT_FAILED_EVENT,
        createdAt: '2026-09-09T12:00:00Z',
      }, { status: 'failed', errorCode: 'REPORT_RANGE_TOO_LARGE' }),
    ]);
    expect(cards[0]).toEqual({
      kind: 'report',
      key: 'r1',
      reportId: 'report-1',
      reportLabel: 'Technician Job Report',
      isFailed: true,
      title: 'Report failed',
      message: failedReportCopy('REPORT_RANGE_TOO_LARGE'),
      statusKey: 'cancelled',
      statusLabel: 'Failed',
      isUnread: true,
      unreadIds: ['r1'],
      latestCreatedAt: '2026-09-09T12:00:00Z',
    });
  });

  it('a known error code renders its own copy', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { eventType: REPORT_FAILED_EVENT }, { errorCode: 'REPORT_TOO_LARGE' }),
    ]);
    expect(cards[0].message).toBe('Too many jobs in this range. Try a shorter one.');
  });

  it('an unknown error code falls back to the honest generic line', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { eventType: REPORT_FAILED_EVENT }, { errorCode: 'SOMETHING_NEW' }),
    ]);
    expect(cards[0].message).toBe('This report failed. Try requesting it again.');
  });

  it('a missing error code uses the same generic fallback', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { eventType: REPORT_FAILED_EVENT }, { errorCode: null }),
    ]);
    expect(cards[0].message).toBe('This report failed. Try requesting it again.');
  });
});

describe('buildReportCard — payload drift', () => {
  it('a missing payload degrades to nulls and fallback copy — never crashes, never undefined', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', {
        payload: undefined as unknown as ApiNotification['payload'],
      }),
    ]);
    expect(cards[0]).toEqual({
      kind: 'report',
      key: 'r1',
      reportId: null,
      reportLabel: null,
      isFailed: false,
      title: 'Report ready',
      message: 'Your report is ready to view.',
      statusKey: 'done',
      statusLabel: 'Ready',
      isUnread: true,
      unreadIds: ['r1'],
      latestCreatedAt: '2026-09-09T12:00:00Z',
    });
  });

  it('a null payload degrades the same way on a failed row', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', {
        eventType: REPORT_FAILED_EVENT,
        payload: null as unknown as ApiNotification['payload'],
      }),
    ]);
    expect(cards[0].reportId).toBeNull();
    expect(cards[0].reportLabel).toBeNull();
    expect(cards[0].message).toBe('This report failed. Try requesting it again.');
  });

  it('non-string fields collapse to null (and the fallback copy) instead of rendering garbage', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', {
        eventType: REPORT_FAILED_EVENT,
      }, {
        reportId: 42,
        reportLabel: { label: 'x' },
        errorCode: true,
      }),
    ]);
    expect(cards[0].reportId).toBeNull();
    expect(cards[0].reportLabel).toBeNull();
    expect(cards[0].message).toBe('This report failed. Try requesting it again.');
    // Every rendered field is defined — no `undefined` can leak to the screen.
    for (const value of Object.values(cards[0])) {
      expect(value).not.toBeUndefined();
    }
  });

  it('empty and whitespace-only strings count as missing', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', {}, { reportId: '', reportLabel: '   ' }),
    ]);
    expect(cards[0].reportId).toBeNull();
    expect(cards[0].reportLabel).toBeNull();
    expect(cards[0].message).toBe('Your report is ready to view.');
  });
});

describe('buildReportCard — event type is authoritative over payload.status', () => {
  it('a report_ready row whose payload.status says failed still renders Ready', () => {
    // The worker picks the event type from the same status it stamps; a
    // drifted payload.status must never flip the card’s family.
    const cards = buildReportCards([
      makeReportNotification('r1', {}, { status: 'failed', errorCode: 'REPORT_GENERATION_FAILED' }),
    ]);
    expect(cards[0].title).toBe('Report ready');
    expect(cards[0].statusKey).toBe('done');
    expect(cards[0].statusLabel).toBe('Ready');
    expect(cards[0].isFailed).toBe(false);
    // The ready branch owns the message — the drift errorCode is ignored.
    expect(cards[0].message).toBe('Technician Job Report is ready to view.');
  });

  it('a report_failed row whose payload.status says ready still renders Failed', () => {
    const cards = buildReportCards([
      makeReportNotification('r1', { eventType: REPORT_FAILED_EVENT }, { status: 'ready' }),
    ]);
    expect(cards[0].title).toBe('Report failed');
    expect(cards[0].statusKey).toBe('cancelled');
    expect(cards[0].statusLabel).toBe('Failed');
    expect(cards[0].isFailed).toBe(true);
  });
});

describe('mergeNotificationCards', () => {
  it('interleaves job and report cards by latestCreatedAt desc', () => {
    const merged = mergeNotificationCards(
      [
        makeJobCard('job-1', '2026-09-09T12:00:00Z'),
        makeJobCard('job-2', '2026-09-09T11:00:00Z'),
      ],
      [
        buildReportCards([makeReportNotification('r2', { createdAt: '2026-09-09T11:30:00Z' })])[0],
        buildReportCards([makeReportNotification('r1', { createdAt: '2026-09-09T10:00:00Z' })])[0],
      ],
    );
    expect(merged.map(c => `${c.kind}:${c.key}`)).toEqual([
      'job:job-1',
      'report:r2',
      'job:job-2',
      'report:r1',
    ]);
  });

  it('a job card newer than some report cards and older than others lands between them', () => {
    const merged = mergeNotificationCards(
      [makeJobCard('job-1', '2026-09-09T11:45:00Z')],
      [
        buildReportCards([makeReportNotification('r1', { createdAt: '2026-09-09T12:30:00Z' })])[0],
        buildReportCards([makeReportNotification('r2', { createdAt: '2026-09-09T11:00:00Z' })])[0],
        buildReportCards([makeReportNotification('r3', { createdAt: '2026-09-09T10:30:00Z' })])[0],
      ],
    );
    expect(merged.map(c => c.key)).toEqual(['r1', 'job-1', 'r2', 'r3']);
  });

  it('a stable sort keeps each side’s internal order on equal timestamps', () => {
    // ES2019 sort stability + reports prepended before the spread: on a tie
    // the report card leads and neither side's own order flips.
    const merged = mergeNotificationCards(
      [makeJobCard('job-1', '2026-09-09T12:00:00Z'), makeJobCard('job-2', '2026-09-09T11:00:00Z')],
      [
        buildReportCards([makeReportNotification('r1', { createdAt: '2026-09-09T12:00:00Z' })])[0],
        buildReportCards([makeReportNotification('r2', { createdAt: '2026-09-09T11:00:00Z' })])[0],
      ],
    );
    expect(merged.map(c => `${c.kind}:${c.key}`)).toEqual([
      'report:r1',
      'job:job-1',
      'report:r2',
      'job:job-2',
    ]);
  });

  it('keeps each side’s own order when timestamps tie within a side', () => {
    const merged = mergeNotificationCards(
      [makeJobCard('job-1', '2026-09-09T12:00:00Z'), makeJobCard('job-2', '2026-09-09T12:00:00Z')],
      [
        buildReportCards([makeReportNotification('r1', { createdAt: '2026-09-09T12:30:00Z' })])[0],
        buildReportCards([makeReportNotification('r2', { createdAt: '2026-09-09T12:30:00Z' })])[0],
      ],
    );
    expect(merged.map(c => c.key)).toEqual(['r1', 'r2', 'job-1', 'job-2']);
  });
});