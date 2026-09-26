/**
 * notificationEventRegistry — the event-type registry's pure decision
 * layer (Story 14-3, per AD-19 / UX-DR7): eventType + role → card kind,
 * and the generic card's one-row-per-card shape. No React, no mocks.
 *
 * The owner-side classifications double as the bit-identical regression
 * guard: owner rows must classify exactly as the pre-registry screen did.
 */
import type { ApiNotification } from '../../services';
import {
  buildGenericCards,
  notificationEventAction,
} from './notificationEventRegistry';

function makeNotification(
  id: string,
  overrides: Partial<ApiNotification> = {},
  payloadOverrides: Record<string, unknown> = {},
): ApiNotification {
  return {
    id,
    jobId: null,
    eventType: 'on_my_way',
    entityType: null,
    entityId: null,
    payload: { title: 'Job update', message: 'Priya is on the way', ...payloadOverrides },
    readAt: null,
    createdAt: '2026-09-09T12:00:00Z',
    ...overrides,
  };
}

describe('notificationEventAction', () => {
  // --- Owner: pre-registry behaviour is bit-identical --------------------------

  it('a report row (owner) is a report card', () => {
    const n = makeNotification('r1', { eventType: 'report_ready', payload: { status: 'ready' } });
    expect(notificationEventAction(n, 'owner')).toBe('report');
    expect(notificationEventAction(makeNotification('r2', { eventType: 'report_failed' }), 'owner')).toBe('report');
  });

  it('a job row (owner) is a job card, regardless of event type', () => {
    const n = makeNotification('n1', { eventType: 'on_my_way', jobId: 'job-1' });
    expect(notificationEventAction(n, 'owner')).toBe('job');
  });

  // --- Technician: job cards route their side, reports are owner-only ---------

  it('a job row (technician) is still a job card', () => {
    expect(
      notificationEventAction(makeNotification('n1', { jobId: 'job-1' }), 'technician'),
    ).toBe('job');
  });

  it('a report row (technician) degrades to generic — reports are an owner surface', () => {
    expect(
      notificationEventAction(makeNotification('r1', { eventType: 'report_ready' }), 'technician'),
    ).toBe('generic');
  });

  // --- Unknown event types: the registry's fallback ----------------------------

  it('an unknown event type with no jobId falls through to generic (both roles)', () => {
    for (const role of ['owner', 'technician'] as const) {
      expect(
        notificationEventAction(makeNotification('x1', { eventType: 'leave_approved' }), role),
      ).toBe('generic');
    }
  });

  it("a job row's jobId is authoritative even for an event type this build doesn't know", () => {
    // jobId is the deep link's target — with one present the row must never
    // render inert, or a real job event would lose its way in.
    expect(
      notificationEventAction(
        makeNotification('x1', { eventType: 'custom_step', jobId: 'job-9' }),
        'technician',
      ),
    ).toBe('job');
  });
});

describe('buildGenericCards', () => {
  it('builds one card per generic row and preserves the list order', () => {
    const cards = buildGenericCards(
      [
        makeNotification('g1', { eventType: 'leave_approved' }),
        makeNotification('n1', { jobId: 'job-1' }), // job → filtered out
        makeNotification('g2', { eventType: 'weekly_off_changed' }),
      ],
      'owner',
    );
    expect(cards.map(c => c.key)).toEqual(['g1', 'g2']);
    expect(cards.every(c => c.kind === 'generic')).toBe(true);
  });

  it('prefers the payload\'s self-contained display text', () => {
    const cards = buildGenericCards(
      [makeNotification('g1', { eventType: 'leave_approved' }, { title: 'Leave approved', message: 'See you on the 30th' })],
      'owner',
    );
    expect(cards[0].title).toBe('Leave approved');
    expect(cards[0].message).toBe('See you on the 30th');
  });

  it('a payload without text falls back to the humanized event type and null message', () => {
    const cards = buildGenericCards(
      [makeNotification('g1', { eventType: 'leave_approved', payload: {} })],
      'owner',
    );
    expect(cards[0].title).toBe('Leave approved'); // underscores → spaces, capped
    expect(cards[0].message).toBeNull();
  });

  it('a drifted payload (null/empty title, blank eventType) never renders undefined', () => {
    const cards = buildGenericCards(
      [
        makeNotification('g1', { eventType: '', payload: null as unknown as Record<string, unknown> }),
        makeNotification('g2', { eventType: 'x', payload: { title: '   ' } }),
      ],
      'owner',
    );
    expect(cards[0].title).toBe('Notification'); // the empty-vocabulary fallback
    expect(cards[0].message).toBeNull();
    expect(cards[1].title).toBe('X'); // whitespace-only title is missing → humanized
    for (const card of cards) {
      for (const value of Object.values(card)) {
        expect(value).not.toBeUndefined();
      }
    }
  });

  it('unread state comes from readAt; latestCreatedAt rides the row', () => {
    const cards = buildGenericCards(
      [
        makeNotification('g1', { readAt: '2026-09-09T12:05:00Z' }),
        makeNotification('g2', {}),
      ],
      'owner',
    );
    expect(cards[0].isUnread).toBe(false);
    expect(cards[0].latestCreatedAt).toBe('2026-09-09T12:00:00Z');
    expect(cards[1].isUnread).toBe(true);
  });

  it('a technician sees their report rows as generic cards (the registry decides)', () => {
    const cards = buildGenericCards(
      [makeNotification('r1', { eventType: 'report_ready', payload: { status: 'ready' } })],
      'technician',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe('generic');
  });
});
