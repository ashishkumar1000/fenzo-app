/**
 * Stage tests for `CancelSheet` (Story 17-7, spec §5 — the employee stage
 * inside the detail sheet): NO reason field anywhere (FR-15 — the confirm
 * is enabled the moment the preview lands); the whole/split confirm
 * labels; the past-Pending split rendering with "stay Pending" (a
 * standing reality, not an edge); the nothing-actionable shape hiding the
 * confirm; the both-empty already-handled notice + OK; the preview
 * failure copy (the action-named offline line / server verbatim /
 * transport fallback) with Retry refetching; the "(including today)"
 * suffix; the loading posture. Host-owned lifecycle branches (success
 * morph, own-retry bare-view, 409 whole-sheet close) pin in the section
 * suite.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    previewCancel: jest.fn(),
    cancelLeave: jest.fn(),
  },
}));

jest.mock('../../../utils/istDate', () => ({
  istTodayDate: () => '2026-09-16',
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import { Button, InlineNotice, Input } from '../../../components/ui';
import { attendanceLeaveService } from '../../../services';
import type { LeaveActionPreview, LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { CancelSheet } from './CancelSheet';

const previewCancel = attendanceLeaveService.previewCancel as jest.Mock;

function row(): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'me',
    startDate: '2026-09-17',
    endDate: '2026-09-18',
    part: 'full_day',
    reason: 'Family',
    status: 'pending',
    workingDays: 2,
    totalDays: 2,
    createdBy: 'self',
    createdAt: '2026-09-10T10:00:00Z',
    dates: [
      { date: '2026-09-17', state: 'pending' },
      { date: '2026-09-18', state: 'pending' },
    ],
  };
}

function preview(overrides: Partial<LeaveActionPreview> = {}): LeaveActionPreview {
  return {
    action: 'cancel',
    actionDates: ['2026-09-17', '2026-09-18'],
    keepDates: [],
    request: row(),
    ...overrides,
  };
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(n => {
    const children = n.props.children;
    return Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
  });
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

/** The confirm — the single `danger` Button in the stage. */
function findConfirm(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Button).find(b => b.props.variant === 'danger');
}

type StageProps = Parameters<typeof CancelSheet>[0];

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
    renderer = create(<CancelSheet {...baseProps()} {...props} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

async function renderLoaded(props: Partial<StageProps> = {}, pv: Partial<LeaveActionPreview> = {}) {
  previewCancel.mockResolvedValue(preview(pv));
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

describe('the whole-request confirm (spec D4)', () => {
  it('a plain future Pending request: single-line confirm, NO reason field, enabled on load', async () => {
    const onConfirm = jest.fn();
    const root = await renderLoaded({ onConfirm });
    expect(root.findAllByType(Input)).toHaveLength(0);
    expect(texts(root)).toContain('17–18 Sep 2026 will be cancelled');
    const confirm = findConfirm(root)!;
    expect(confirm.props.children).toBe('Cancel request');
    expect(confirm.props.disabled).toBe(false);
    await act(async () => {
      confirm.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('loading: the spinner shows and the confirm renders disabled', async () => {
    previewCancel.mockReturnValue(new Promise(() => undefined));
    const root = await renderStage();
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(findConfirm(root)!.props.disabled).toBe(true);
    expect(findConfirm(root)!.props.accessibilityState).toEqual({ disabled: true });
  });
});

describe('the split rendering (the past-Pending standing reality)', () => {
  it('past Pending days read "stay Pending"; the confirm is "Cancel remaining days"', async () => {
    const root = await renderLoaded(
      {},
      {
        actionDates: ['2026-09-18'],
        keepDates: [{ date: '2026-09-17', state: 'pending', reason: 'past' }],
        request: {
          ...row(),
          startDate: '2026-09-17',
          dates: [
            { date: '2026-09-17', state: 'pending' },
            { date: '2026-09-18', state: 'pending' },
          ],
        },
      },
    );
    expect(texts(root)).toContain('17 Sep 2026 stays Pending (already started or past)');
    expect(texts(root)).toContain('18 Sep 2026 will be cancelled');
    expect(findConfirm(root)!.props.children).toBe('Cancel remaining days');
  });

  it('"(including today)" when today is in the affected set (cutoff not passed)', async () => {
    const root = await renderLoaded(
      {},
      { actionDates: ['2026-09-16', '2026-09-18'] },
    );
    expect(texts(root)).toContain(
      '16–18 Sep 2026 will be cancelled (including today)',
    );
  });
});

describe('the nothing-actionable + already-handled shapes', () => {
  it('nothing-actionable hides the confirm; the cancel-named notice shows; Back remains', async () => {
    const onBack = jest.fn();
    const root = await renderLoaded(
      { onBack },
      {
        actionDates: [],
        keepDates: [{ date: '2026-09-15', state: 'pending', reason: 'past' }],
        request: { ...row(), startDate: '2026-09-15' },
      },
    );
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe(
      'Nothing can be cancelled — the remaining days are already started or past.',
    );
    // The a11y floor: the async-arriving notice announces (polite region).
    expect(
      root.findAll(n => n.props.accessibilityLiveRegion === 'polite').length,
    ).toBeGreaterThan(0);
    expect(findConfirm(root)).toBeUndefined();
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('both arrays empty: the already-handled notice + OK closes the whole sheet', async () => {
    const onDismissHandled = jest.fn();
    const root = await renderLoaded(
      { onDismissHandled },
      { actionDates: [], keepDates: [] },
    );
    expect(root.findAllByType(InlineNotice)[0].props.message).toBe(
      'This request was already handled',
    );
    await act(async () => {
      findButtonByText(root, 'OK')!.props.onPress();
    });
    expect(onDismissHandled).toHaveBeenCalledTimes(1);
  });
});

describe('the preview failure + retry', () => {
  it('offline: the cancel-named line + Retry refetches', async () => {
    previewCancel
      .mockRejectedValueOnce({ status: 0, code: 'TIMEOUT', message: 'x' })
      .mockResolvedValueOnce(preview());
    const root = await renderStage();
    expect(texts(root)).toContain(
      "You're offline. Cancelling needs a working connection.",
    );
    await act(async () => {
      findButtonByText(root, 'Retry')!.props.onPress();
    });
    expect(previewCancel).toHaveBeenCalledTimes(2);
    expect(texts(root)).toContain('17–18 Sep 2026 will be cancelled');
  });

  it('a server failure surfaces the message verbatim', async () => {
    previewCancel.mockRejectedValueOnce({
      status: 404,
      code: 'NOT_FOUND',
      message: 'That could not be found.',
    });
    const root = await renderStage();
    expect(texts(root)).toContain('That could not be found.');
  });
});

describe('the write posture (host-owned)', () => {
  it('submitting: the confirm spins and Back renders disabled', async () => {
    const root = await renderLoaded({ submitting: true });
    expect(findConfirm(root)!.props.loading).toBe(true);
    expect(findButtonByText(root, 'Back')!.props.disabled).toBe(true);
  });
});
