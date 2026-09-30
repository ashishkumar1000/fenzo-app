/**
 * Stage tests for `RevokeSheet` (Story 17-7, spec §5 — the owner stage
 * inside the detail sheet): the loading posture (spinner in the hero
 * slot, confirm rendered disabled, reason editable); the reason gate
 * (confirm disabled until filled, `accessibilityState` carried, trimmed
 * reason travels); the whole/split confirm labels; the nothing-actionable
 * shape HIDING the confirm and the reason (dead-control rule); the
 * both-empty already-handled notice + OK; the preview failure
 * (offline line, server verbatim, transport fallback) with Retry
 * refetching; Back; the per-day block for uncovered days; the write
 * error slot. Host-owned lifecycle branches (success morph, own-retry
 * bare-view, 409 whole-sheet close, divergence) pin in the screen suites.
 *
 * RTR gotchas honoured: Buttons are driven BY TYPE + children (they
 * double-carry onPress); async flushes through `await act(async () => {})`.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    previewRevoke: jest.fn(),
    revokeLeave: jest.fn(),
  },
}));

// The stage copy is clock-sensitive ("(including today)") — pin the clock.
jest.mock('../../../utils/istDate', () => ({
  istTodayDate: () => '2026-09-16',
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, ActivityIndicator, Text } from 'react-native';
import { Button, InlineError, InlineNotice, Input } from '../../../components/ui';
import { attendanceLeaveService } from '../../../services';
import type { LeaveActionPreview, LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { RevokeSheet } from './RevokeSheet';

const previewRevoke = attendanceLeaveService.previewRevoke as jest.Mock;

function row(): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'e1',
    employeeName: 'Arya',
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
      { date: '2026-09-14', state: 'approved', reason: 'past' },
      { date: '2026-09-15', state: 'approved', reason: 'past' },
      { date: '2026-09-16', state: 'approved', reason: 'cutoff_passed' },
    ],
    request: row(),
    ...overrides,
  };
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

/** The confirm — the single `danger` Button in the stage. */
function findConfirm(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Button).find(b => b.props.variant === 'danger');
}

type StageProps = Parameters<typeof RevokeSheet>[0];

const baseProps = (): StageProps => ({
  request: row(),
  submitting: false,
  errorMessage: null,
  onBack: jest.fn(),
  onConfirm: jest.fn(),
  onDismissHandled: jest.fn(),
});

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderStage(props: Partial<StageProps> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<RevokeSheet {...baseProps()} {...props} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

async function renderLoaded(props: Partial<StageProps> = {}, pv: Partial<LeaveActionPreview> = {}) {
  previewRevoke.mockResolvedValue(preview(pv));
  const root = await renderStage(props);
  await act(async () => {});
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('the loading posture (spec D1)', () => {
  it('spinner in the hero slot, confirm rendered disabled, reason editable', async () => {
    previewRevoke.mockReturnValue(new Promise(() => undefined));
    const root = await renderStage();
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);
    const confirm = findConfirm(root)!;
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true });
    expect(root.findAllByType(Input)).toHaveLength(1);
  });
});

describe('the reason gate (spec D3)', () => {
  it('an empty reason keeps the confirm disabled (with the a11y state)', async () => {
    const root = await renderLoaded();
    const confirm = findConfirm(root)!;
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true });
  });

  it('a whitespace-only reason still gates; the trimmed value travels', async () => {
    const onConfirm = jest.fn();
    const root = await renderLoaded({ onConfirm });
    expect(texts(root)).toContain('0 / 500');
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('   ');
    });
    expect(findConfirm(root)!.props.disabled).toBe(true);
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('  Client moved the dates  ');
    });
    const confirm = findConfirm(root)!;
    expect(confirm.props.disabled).toBe(false);
    expect(confirm.props.accessibilityState).toEqual({ disabled: false });
    await act(async () => {
      confirm.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledWith('Client moved the dates');
  });

  it('the split context labels the confirm "Revoke remaining days"; the reason label is required', async () => {
    const root = await renderLoaded();
    expect(findConfirm(root)!.props.children).toBe('Revoke remaining days');
    expect(root.findAllByType(Input)[0].props.label).toBe('Reason (required)');
    expect(texts(root)).toContain('14–16 Sep 2026 stay Approved (already started or past)');
    expect(texts(root)).toContain('17–18 Sep 2026 will be revoked');
  });

  it('the whole context (nothing started) labels the confirm "Revoke leave"', async () => {
    const root = await renderLoaded(
      {},
      { keepDates: [], actionDates: ['2026-09-17', '2026-09-18'] },
    );
    expect(findConfirm(root)!.props.children).toBe('Revoke leave');
    expect(texts(root)).not.toContain(
      '14–16 Sep 2026 stay Approved (already started or past)',
    );
  });

  it('the hero is one composite carrying the model label', async () => {
    const root = await renderLoaded();
    const composite = root.findAll(
      n => n.props.accessibilityLiveRegion === 'polite',
    );
    expect(composite.length).toBeGreaterThan(0);
    expect(composite[0].props.accessibilityLabel).toBe(
      '3 days stay Approved, 14–16 Sep 2026. 2 days will be revoked, 17–18 Sep 2026.',
    );
  });
});

describe('the nothing-actionable + already-handled shapes (spec D2)', () => {
  it('nothing-actionable hides BOTH the confirm and the reason; Back remains', async () => {
    const onBack = jest.fn();
    const root = await renderLoaded(
      { onBack },
      { actionDates: [] },
    );
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe(
      'Nothing can be revoked — the remaining days are already started or past.',
    );
    expect(notices[0].props.tone).toBe('neutral');
    // The a11y floor: the async-arriving notice announces (polite region).
    expect(
      root.findAll(n => n.props.accessibilityLiveRegion === 'polite').length,
    ).toBeGreaterThan(0);
    expect(findConfirm(root)).toBeUndefined();
    expect(root.findAllByType(Input)).toHaveLength(0);
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('both arrays empty: the already-handled notice + OK that closes the whole sheet', async () => {
    const onDismissHandled = jest.fn();
    const root = await renderLoaded(
      { onDismissHandled },
      { actionDates: [], keepDates: [] },
    );
    const notices = root.findAllByType(InlineNotice);
    expect(notices[0].props.message).toBe('This request was already handled');
    expect(findConfirm(root)).toBeUndefined();
    await act(async () => {
      findButtonByText(root, 'OK')!.props.onPress();
    });
    expect(onDismissHandled).toHaveBeenCalledTimes(1);
  });
});

describe('the preview failure + retry (spec D3)', () => {
  it('offline: the action-named line + Retry refetches', async () => {
    previewRevoke
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' })
      .mockResolvedValueOnce(preview());
    const root = await renderStage();
    expect(texts(root)).toContain(
      "You're offline. Revoking needs a working connection.",
    );
    await act(async () => {
      findButtonByText(root, 'Retry')!.props.onPress();
    });
    expect(previewRevoke).toHaveBeenCalledTimes(2);
    expect(texts(root)).toContain('17–18 Sep 2026 will be revoked');
  });

  it('a server failure surfaces the message verbatim; a message-less one the transport line', async () => {
    previewRevoke.mockRejectedValueOnce({
      status: 500,
      code: 'SERVER_ERROR',
      message: 'Server is angry',
    });
    const root = await renderStage();
    expect(texts(root)).toContain('Server is angry');
    const renderer = lastRenderer!;
    act(() => renderer.unmount());
    lastRenderer = null;

    previewRevoke.mockRejectedValueOnce({ status: 500, code: 'SERVER_ERROR', message: '' });
    const root2 = await renderStage();
    expect(texts(root2)).toContain(
      "Couldn't load the preview. Check your connection.",
    );
  });
});

describe('the write posture (host-owned)', () => {
  it('submitting: the confirm spins; Back is disabled mid-write', async () => {
    const root = await renderLoaded({ submitting: true });
    const confirm = findConfirm(root)!;
    expect(confirm.props.loading).toBe(true);
    expect(confirm.props.disabled).toBe(true);
    expect(findButtonByText(root, 'Back')!.props.disabled).toBe(true);
  });

  it('a write failure renders the server message above the buttons', async () => {
    const root = await renderLoaded({
      errorMessage: "You're offline. Revoking needs a working connection.",
    });
    const errors = root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe(
      "You're offline. Revoking needs a working connection.",
    );
  });
});

describe('the per-day block (split-only)', () => {
  it('a day in neither hero group (check-in auto-cancel) renders the full per-day list', async () => {
    const pv = preview({
      keepDates: [
        { date: '2026-09-14', state: 'approved', reason: 'past' },
        { date: '2026-09-16', state: 'approved', reason: 'cutoff_passed' },
      ],
    });
    pv.request.dates = [
      { date: '2026-09-14', state: 'approved' },
      { date: '2026-09-15', state: 'cancelled' }, // check-in auto-cancelled
      { date: '2026-09-16', state: 'approved' },
      { date: '2026-09-17', state: 'approved' },
      { date: '2026-09-18', state: 'approved' },
    ];
    previewRevoke.mockResolvedValue(pv);
    const root = await renderStage();
    await act(async () => {});
    expect(texts(root)).toContain('15 Sep 2026');
    expect(texts(root)).toContain('14 Sep 2026');
  });
});

describe('the preview-arrival announce (17-7 review: D6 floor, iOS has no live region)', () => {
  it('announces the hero composite once the preview lands', async () => {
    previewRevoke.mockResolvedValue(preview());
    const root = await renderStage();
    await act(async () => {});
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    expect(announce).toHaveBeenCalled();
    const last = announce.mock.calls.at(-1)![0] as string;
    expect(last).toContain('will be revoked');
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('the nothing-actionable notice announces its own message instead of a hero', async () => {
    previewRevoke.mockResolvedValue(
      preview({
        actionDates: [],
        keepDates: [{ date: '2026-09-14', state: 'approved', reason: 'past' }],
      }),
    );
    await renderStage();
    await act(async () => {});
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const last = announce.mock.calls.at(-1)![0] as string;
    expect(last).toContain('Nothing can be revoked');
  });
});
