/**
 * Model tests for `leaveSplitModel` (Story 17-7, spec §3): the truth
 * table over the shipped preview shape — the four hero shapes (split /
 * whole / nothing-actionable / already-handled), the plural rule
 * (1-vs-2+), the STATE-AWARE stays-word (a Pending request's past days
 * read "stay Pending" — never a hardcoded "stay Approved"), the
 * "(including today)" suffix, the a11y composite, the confirm labels, and
 * the "reason is not branched on" pin (two previews differing ONLY in
 * `keepDates[].reason` produce identical copy).
 */
import type { LeaveActionPreview } from '../../../services/resources/attendanceLeave';
import {
  buildLeaveSplitCopy,
  leaveConfirmContext,
  leaveConfirmLabel,
  leaveNothingActionableMessage,
  leavePerDayBlockDates,
  leaveSplitShape,
} from './leaveSplitModel';

const TODAY = '2026-09-16';

function view(): LeaveActionPreview['request'] {
  return {
    id: 'r1',
    employeeId: 'e1',
    startDate: '2026-09-14',
    endDate: '2026-09-18',
    part: 'full_day',
    reason: 'Family',
    status: 'approved',
    workingDays: 5,
    totalDays: 5,
    createdBy: 'self',
    createdAt: '2026-09-10T10:00:00Z',
    dates: [
      { date: '2026-09-14', state: 'approved' },
      { date: '2026-09-15', state: 'approved' },
      { date: '2026-09-16', state: 'approved' },
      { date: '2026-09-17', state: 'approved' },
      { date: '2026-09-18', state: 'approved' },
    ],
  };
}

function preview(overrides: Partial<LeaveActionPreview> = {}): LeaveActionPreview {
  return {
    action: 'revoke',
    actionDates: ['2026-09-17', '2026-09-18'],
    keepDates: [
      { date: '2026-09-16', state: 'approved', reason: 'cutoff_passed' },
      { date: '2026-09-14', state: 'approved', reason: 'past' },
      { date: '2026-09-15', state: 'approved', reason: 'cutoff_passed' },
    ],
    request: view(),
    ...overrides,
  };
}

describe('the four hero shapes', () => {
  it('split: actionDates + keepDates both non-empty', () => {
    expect(leaveSplitShape(preview())).toBe('split');
  });

  it('whole: keepDates empty (nothing has started yet)', () => {
    expect(
      leaveSplitShape(preview({ keepDates: [], actionDates: ['2026-09-17'] })),
    ).toBe('whole');
  });

  it('nothing-actionable: actionDates empty, keepDates non-empty (200, never 409)', () => {
    expect(leaveSplitShape(preview({ actionDates: [] }))).toBe(
      'nothing-actionable',
    );
  });

  it('already-handled: BOTH arrays empty (stale sheet / zero source-state days)', () => {
    expect(leaveSplitShape(preview({ actionDates: [], keepDates: [] }))).toBe(
      'already-handled',
    );
  });
});

describe('the split copy (revoke)', () => {
  it('stays line first with the range, the 2+ plural and the parenthetical', () => {
    const copy = buildLeaveSplitCopy(preview(), TODAY);
    expect(copy.staysLine).toBe(
      '14–16 Sep 2026 stay Approved (already started or past)',
    );
    expect(copy.actionLine).toBe('17–18 Sep 2026 will be revoked');
  });

  it('one kept day reads "stays" (the 1-vs-2+ plural rule)', () => {
    const copy = buildLeaveSplitCopy(
      preview({
        keepDates: [{ date: '2026-09-16', state: 'approved', reason: 'cutoff_passed' }],
      }),
      TODAY,
    );
    expect(copy.staysLine).toBe(
      '16 Sep 2026 stays Approved (already started or past)',
    );
    expect(copy.compositeLabel).toBe(
      '1 day stays Approved, 16 Sep 2026. 2 days will be revoked, 17–18 Sep 2026.',
    );
  });

  it('the stays-word derives from keepDates[].state — a Pending request reads "stay Pending"', () => {
    const copy = buildLeaveSplitCopy(
      preview({
        action: 'cancel',
        keepDates: [
          { date: '2026-09-15', state: 'pending', reason: 'past' },
          { date: '2026-09-16', state: 'pending', reason: 'cutoff_passed' },
        ],
        actionDates: ['2026-09-17'],
      }),
      TODAY,
    );
    expect(copy.staysLine).toBe(
      '15–16 Sep 2026 stay Pending (already started or past)',
    );
    expect(copy.actionLine).toBe('17 Sep 2026 will be cancelled');
  });

  it('"(including today)" when today is in the affected set — and absent when not', () => {
    const withToday = buildLeaveSplitCopy(
      preview({ actionDates: ['2026-09-16', '2026-09-18'] }),
      TODAY,
    );
    expect(withToday.actionLine).toBe(
      '16–18 Sep 2026 will be revoked (including today)',
    );
    const withoutToday = buildLeaveSplitCopy(preview(), TODAY);
    expect(withoutToday.actionLine).toBe('17–18 Sep 2026 will be revoked');
  });

  it('the a11y composite is one sentence: counts + lists, stays group first', () => {
    const copy = buildLeaveSplitCopy(preview(), TODAY);
    expect(copy.compositeLabel).toBe(
      '3 days stay Approved, 14–16 Sep 2026. 2 days will be revoked, 17–18 Sep 2026.',
    );
  });

  it('the reason is NOT branched on: flipping every keepDates.reason changes nothing', () => {
    const flipped = preview({
      keepDates: preview().keepDates.map(k => ({
        ...k,
        reason: (k.reason === 'past' ? 'cutoff_passed' : 'past') as
          | 'past'
          | 'cutoff_passed',
      })),
    });
    expect(buildLeaveSplitCopy(preview(), TODAY)).toEqual(
      buildLeaveSplitCopy(flipped, TODAY),
    );
  });
});

describe('the degenerate forms', () => {
  it('whole: no stays line, a single-line composite, the whole confirm context', () => {
    const copy = buildLeaveSplitCopy(
      preview({ keepDates: [] }),
      TODAY,
    );
    expect(copy.staysLine).toBeNull();
    expect(copy.actionLine).toBe('17–18 Sep 2026 will be revoked');
    expect(copy.compositeLabel).toBe(
      '2 days will be revoked, 17–18 Sep 2026.',
    );
    expect(leaveConfirmContext(preview({ keepDates: [] }))).toBe('whole');
  });

  it('nothing-actionable: the action-named notice is the composite (keepDates present)', () => {
    const copy = buildLeaveSplitCopy(preview({ actionDates: [] }), TODAY);
    expect(copy.shape).toBe('nothing-actionable');
    expect(copy.staysLine).toBeNull();
    expect(copy.actionLine).toBeNull();
    expect(copy.compositeLabel).toBe(
      'Nothing can be revoked — the remaining days are already started or past.',
    );
    expect(leaveNothingActionableMessage('cancel')).toBe(
      'Nothing can be cancelled — the remaining days are already started or past.',
    );
  });

  it('already-handled: the honest notice replaces the hero', () => {
    const copy = buildLeaveSplitCopy(
      preview({ actionDates: [], keepDates: [] }),
      TODAY,
    );
    expect(copy.compositeLabel).toBe('This request was already handled');
    expect(copy.staysLine).toBeNull();
    expect(copy.actionLine).toBeNull();
  });
});

describe('the confirm labels (the D5 table, verbatim)', () => {
  it('revoke: whole "Revoke leave" / split "Revoke remaining days"', () => {
    expect(leaveConfirmLabel('revoke', 'whole')).toBe('Revoke leave');
    expect(leaveConfirmLabel('revoke', 'split')).toBe('Revoke remaining days');
  });

  it('cancel: whole "Cancel request" / split "Cancel remaining days"', () => {
    expect(leaveConfirmLabel('cancel', 'whole')).toBe('Cancel request');
    expect(leaveConfirmLabel('cancel', 'split')).toBe('Cancel remaining days');
  });

  it('the context follows keepDates, not the action verb', () => {
    expect(leaveConfirmContext(preview())).toBe('split');
    expect(
      leaveConfirmContext(preview({ action: 'cancel', keepDates: [] })),
    ).toBe('whole');
  });
});

describe('the per-day chip block hosting (split-only)', () => {
  it('a day in NEITHER hero group (a check-in auto-cancel) surfaces the FULL per-day list', () => {
    const mixed = preview({
      actionDates: ['2026-09-17', '2026-09-18'],
      keepDates: [
        { date: '2026-09-14', state: 'approved', reason: 'past' },
        { date: '2026-09-16', state: 'approved', reason: 'cutoff_passed' },
      ],
    });
    mixed.request.dates = [
      { date: '2026-09-14', state: 'approved' },
      { date: '2026-09-15', state: 'cancelled' }, // check-in auto-cancelled
      { date: '2026-09-16', state: 'approved' },
      { date: '2026-09-17', state: 'approved' },
      { date: '2026-09-18', state: 'approved' },
    ];
    expect(leavePerDayBlockDates(mixed)).toHaveLength(5);
  });

  it('fully covered span: no block (the hero arithmetic adds up)', () => {
    expect(leavePerDayBlockDates(preview())).toEqual([]);
  });
});
