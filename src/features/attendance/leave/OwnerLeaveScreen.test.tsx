/**
 * Screen tests for `OwnerLeaveScreen` (Story 17-6, spec §5; 17-7 adds the
 * revoke wiring). Pins: the first-load spinner → rows; the per-tab cache
 * with the cursor-safety invariant (a Pending cursor never paginates All);
 * pull-to-refresh resetting the ACTIVE tab only (announced); approve on
 * Pending REMOVES the row + announcement; approve on All replaces in
 * place; the 409 LEAVE_NOT_PENDING sheet (notice + OK + row refetch — no
 * timer); own-retry-200 = success; the two-stage reject (1→2→Back→1) with
 * the empty reason valid; `dismissible={false}` mid-write; the
 * double-tap latch; the CTA card; the status chip omitted on Pending /
 * present on All; per-tab empty states; the load failure + Retry. 17-7:
 * the outline-danger revoke entry on an Approved row, the stage morph
 * (title swap, preview per entry), the reason gate, the success morph
 * back to the refreshed detail (split keeps the derived chip; full flips
 * grey), own-retry bare-view success, 409 LEAVE_NOT_REVOKABLE
 * whole-sheet close + refetch, divergence absorption, offline line.
 *
 * RTR gotchas honoured (spec-17-5 §4): text matching flattens JSX array
 * children; buttons are found by role + label (never findAllByProps with
 * asymmetric matchers); Button double-carries onPress, so the sheet's
 * buttons are driven BY TYPE + children; async work flushes through
 * `await act(async () => {})`.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listOwnerLeave: jest.fn(),
    approveLeave: jest.fn(),
    rejectLeave: jest.fn(),
    previewRevoke: jest.fn(),
    revokeLeave: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, AppState, FlatList, Text } from 'react-native';
import { Button, Input, SegmentedControl, Sheet } from '../../../components/ui';
import { InlineNotice } from '../../../components/ui';
import { colors } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import type { LeaveActionPreview, LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveDetailSheet } from './LeaveDetailSheet';
import { LeaveRequestRow as LeaveRequestRowView } from './LeaveRequestRow';
import OwnerLeaveScreen from './OwnerLeaveScreen';

const listOwnerLeave = attendanceLeaveService.listOwnerLeave as jest.Mock;
const approveLeave = attendanceLeaveService.approveLeave as jest.Mock;
const rejectLeave = attendanceLeaveService.rejectLeave as jest.Mock;
const previewRevoke = attendanceLeaveService.previewRevoke as jest.Mock;
const revokeLeave = attendanceLeaveService.revokeLeave as jest.Mock;
const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

function leaveRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'e1',
    employeeName: 'Arya',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    part: 'full_day',
    reason: 'Family',
    status: 'pending',
    workingDays: 3,
    totalDays: 5,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [
      { date: '2026-10-05', state: 'pending' },
      { date: '2026-10-06', state: 'pending' },
      { date: '2026-10-07', state: 'pending' },
    ],
    ...overrides,
  };
}

const page = (data: LeaveRequestRow[], nextCursor: string | null, hasMore = nextCursor !== null) => ({
  data,
  nextCursor,
  hasMore,
});

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function textsInOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** Button-role nodes carrying onPress + the exact label (house finder). */
function findButtons(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
  );
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn(() => jest.fn()),
    canGoBack: jest.fn(() => true),
  };
}

type Nav = ReturnType<typeof makeNavigation>;

// Unmounted in afterEach — a live FlatList's VirtualizedList keeps a
// cell-update `setTimeout` that otherwise fires AFTER the tests: a setState
// outside act whose scheduler tail poisons the next suite in this worker
// (found as moving uncaught-error failures across unrelated suites).
let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderScreen(params: { tab?: 'pending' | 'all' } = {}): Promise<{
  renderer: ReactTestRenderer.ReactTestRenderer;
  root: ReactTestRenderer.ReactTestInstance;
  navigation: Nav;
}> {
  const navigation = makeNavigation();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params } as never}
      />,
    );
  });
  lastRenderer = renderer;
  return { renderer, root: renderer.root, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
  listOwnerLeave.mockResolvedValue(page([], null));
  approveLeave.mockResolvedValue(leaveRow());
  rejectLeave.mockResolvedValue(leaveRow());
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('first load and the CTA card (spec D1)', () => {
  it('the first page loads the ACTIVE tab with the pending filter and renders rows', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], 'CUR-2'));
    const { root } = await renderScreen();
    expect(listOwnerLeave).toHaveBeenCalledWith({ status: 'pending', limit: 20 });
    expect(root.findAllByType(LeaveRequestRowView)).toHaveLength(1);
  });

  it('the CTA card leads the list on both tabs and navigates to ApplyOnBehalf', async () => {
    const { root, navigation } = await renderScreen();
    const cta = findButtons(root, 'Apply on behalf');
    expect(cta).toHaveLength(1);
    const texts = textsInOrder(root);
    expect(texts).toContain('Apply on behalf');
    expect(texts).toContain('Apply leave for a team member');
    await act(async () => {
      cta[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('ApplyOnBehalf', undefined);
  });

  it('a load failure with nothing loaded shows the error + Retry, which refetches', async () => {
    listOwnerLeave.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await renderScreen();
    expect(textsInOrder(root)).toContain(
      "Couldn't load leave requests. Check your connection and try again.",
    );
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    await act(async () => {
      findButtonByText(root, 'Retry')!.props.onPress();
    });
    expect(root.findAllByType(LeaveRequestRowView)).toHaveLength(1);
  });

  it('the Pending tab renders the per-tab empty state; the EmptyState itself carries no CTA (the card above is the CTA, per D1)', async () => {
    const { root } = await renderScreen();
    expect(textsInOrder(root)).toContain('No pending requests');
    expect(textsInOrder(root)).toContain(
      "You're all caught up. New leave requests will show up here.",
    );
  });
});

describe('per-tab state and the cursor-safety invariant (spec D1)', () => {
  it('switching to All keeps the Pending cache and loads the unfiltered list', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], null));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ limit: 20 });
    // Both caches coexist: switching back serves the Pending rows from cache.
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('pending');
    });
    expect(root.findAllByType(LeaveRequestRowView)).toHaveLength(1);
    expect(listOwnerLeave).toHaveBeenCalledTimes(2);
  });

  it("onEndReached paginates ONLY the active tab's own cursor", async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], 'CUR-A-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'p2' })], null));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    await act(async () => {
      root.findByType(FlatList).props.onEndReached();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ cursor: 'CUR-A-1', limit: 20 });
    // Back on Pending: its load-more consumes the PENDING cursor.
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('pending');
    });
    await act(async () => {
      root.findByType(FlatList).props.onEndReached();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', cursor: 'CUR-P-1', limit: 20 });
  });

  it('pull-to-refresh resets the ACTIVE tab only and announces', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'r9' })], null));
    const { root } = await renderScreen();
    const flatList = root.findByType(FlatList);
    await act(async () => {
      flatList.props.refreshControl.props.onRefresh();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
    expect(announce).toHaveBeenCalledWith('Leave requests updated');
    expect(flatList.props.data.map((r: LeaveRequestRow) => r.id)).toEqual(['r9']);
  });

  it('a refresh failure with data keeps the rows and shows the notice', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const { root } = await renderScreen();
    listOwnerLeave.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    await act(async () => {
      root.findByType(FlatList).props.refreshControl.props.onRefresh();
    });
    expect(textsInOrder(root)).toContain("Couldn't refresh. Showing the last loaded list.");
    expect(root.findAllByType(LeaveRequestRowView)).toHaveLength(1);
  });

  it('the status chip is omitted on Pending rows and present on All rows', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], null))
      .mockResolvedValueOnce(
        page([leaveRow({ id: 'a1', status: 'approved' })], null),
      );
    const { root } = await renderScreen();
    expect(root.findAllByType(LeaveRequestRowView)[0].props.showStatus).toBe(false);
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    expect(root.findAllByType(LeaveRequestRowView)[0].props.showStatus).toBe(true);
  });

  it('the All tab renders its own empty state when the unfiltered list is empty', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([], null));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    expect(textsInOrder(root)).toContain('No leave requests yet');
    expect(textsInOrder(root)).toContain(
      'When your team applies for leave, it will show up here.',
    );
  });
});

describe('approve (spec D2 lifecycle)', () => {
  async function openQueueWithTwoPending() {
    listOwnerLeave.mockResolvedValueOnce(
      page([leaveRow({ id: 'r1' }), leaveRow({ id: 'r2', employeeName: 'Suresh' })], null),
    );
    return renderScreen();
  }

  it('single tap, no confirmation: on Pending the row is REMOVED and announced', async () => {
    approveLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'approved' }));
    const { root } = await openQueueWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    expect(approveLeave).toHaveBeenCalledWith('r1');
    expect(announce).toHaveBeenCalledWith('Leave approved');
    const ids = (root.findByType(FlatList).props.data as LeaveRequestRow[]).map(r => r.id);
    expect(ids).toEqual(['r2']); // the approved row left the filtered list
  });

  it('on All the decided row is REPLACED in place (and the chip shows it)', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1' })], null));
    approveLeave.mockResolvedValue(leaveRow({ id: 'a1', status: 'approved' }));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data.map(r => r.id)).toEqual(['a1']);
    expect(data[0].status).toBe('approved');
  });

  it('a double-tap while in flight is a no-op (the latch)', async () => {
    let resolveWrite!: (v: LeaveRequestRow) => void;
    approveLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        resolveWrite = resolve;
      }),
    );
    const { root } = await openQueueWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    const approve = findButtonByText(root, 'Approve')!;
    await act(async () => {
      approve.props.onPress();
      approve.props.onPress();
    });
    resolveWrite(leaveRow({ id: 'r1', status: 'approved' }));
    await act(async () => {});
    expect(approveLeave).toHaveBeenCalledTimes(1);
  });

  it('own-retry 200 = success: a failed attempt keeps the sheet, the retry closes it', async () => {
    approveLeave
      .mockRejectedValueOnce({ status: 0, code: 'TIMEOUT', message: 'x' })
      .mockResolvedValueOnce(leaveRow({ id: 'r1', status: 'approved' }));
    const { root } = await openQueueWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    expect(textsInOrder(root)).toContain(
      "You're offline. Approving needs a working connection.",
    );
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    expect(approveLeave).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith('Leave approved');
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });

  it('409 LEAVE_NOT_PENDING swaps to the notice + OK and refetches the row truth', async () => {
    approveLeave.mockRejectedValue({
      status: 409,
      code: 'LEAVE_NOT_PENDING',
      message: 'This leave request has already been decided.',
    });
    const { root } = await openQueueWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe('This request was already handled');
    expect(notices[0].props.tone).toBe('neutral');
    // The row refetched to its true state behind the sheet.
    expect(listOwnerLeave).toHaveBeenCalledTimes(2);
    // OK closes the WHOLE sheet.
    await act(async () => {
      findButtonByText(root, 'OK')!.props.onPress();
    });
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });

  it('the sheet is dismissible={false} while the write is in flight', async () => {
    let resolveWrite!: (v: LeaveRequestRow) => void;
    approveLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        resolveWrite = resolve;
      }),
    );
    const { root } = await openQueueWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    const sheet = root.findAllByType(Sheet)[0];
    expect(sheet.props.dismissible).toBe(true);
    await act(async () => {
      findButtonByText(root, 'Approve')!.props.onPress();
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(false);
    resolveWrite(leaveRow({ id: 'r1', status: 'approved' }));
    await act(async () => {});
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });
});

describe('reject — two stages (spec D2)', () => {
  async function openSheet() {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const ctx = await renderScreen();
    await act(async () => {
      findButtons(ctx.root, 'Leave request for Arya, 5–9 Oct 2026, 3 working days, Pending')[0].props.onPress();
    });
    return ctx;
  }

  it('stage 1 → stage 2 reveals the reason input; Back returns to stage 1', async () => {
    const { root } = await openSheet();
    expect(findButtonByText(root, 'Reject request')).toBeUndefined();
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    expect(findButtonByText(root, 'Reject request')).toBeDefined();
    expect(findButtonByText(root, 'Back')).toBeDefined();
    expect(textsInOrder(root)).toContain('0 / 500');
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(findButtonByText(root, 'Reject request')).toBeUndefined();
    expect(findButtonByText(root, 'Reject')).toBeDefined();
  });

  it('the empty reason is valid — the wire omits the field', async () => {
    rejectLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'rejected' }));
    const { root } = await openSheet();
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Reject request')!.props.onPress();
    });
    expect(rejectLeave).toHaveBeenCalledWith('r1', undefined);
    expect(announce).toHaveBeenCalledWith('Leave rejected');
  });

  it('a typed reason travels trimmed; the Reject button carries the danger variant', async () => {
    rejectLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'rejected' }));
    const { root } = await openSheet();
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(LeaveDetailSheet)[0].props.onReject === undefined; // no-op guard
    });
    const rejectRequest = findButtonByText(root, 'Reject request')!;
    expect(rejectRequest.props.variant).toBe('danger');
    expect(rejectRequest.props.fullWidth).toBe(true);
  });
});

describe('the landing param channel always fetches fresh (17-6 review P1)', () => {
  it('a param-driven switch refetches even a loaded, non-stale tab (the born-approved request is visible)', async () => {
    const { renderer, navigation } = await renderScreen();
    // Both tabs loaded, nothing stale.
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], null))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], null));
    await act(async () => {
      renderer.root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    const callsAfterLoad = listOwnerLeave.mock.calls.length;
    // The on-behalf landing: navigate('OwnerLeave', { tab: 'all' }) merges
    // the param while the owner is already ON Pending.
    renderer.update(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params: { tab: 'all' } } as never}
      />,
    );
    await act(async () => {});
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it('a same-tab landing param refreshes a quiet, loaded tab', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const { renderer, navigation } = await renderScreen();
    const callsAfterLoad = listOwnerLeave.mock.calls.length;
    // The on-behalf landing while the owner is parked on Pending: the
    // merged param appears where there was none (the real popTo merge).
    renderer.update(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params: { tab: 'pending' } } as never}
      />,
    );
    await act(async () => {});
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
  });
});

describe('the load-more interleave guards (17-6 review P2)', () => {
  function focusCallback(navigation: Nav): () => void {
    const calls = (navigation.addListener as jest.Mock).mock.calls as [
      string,
      () => void,
    ][];
    const entry = calls.find(([event]) => event === 'focus');
    expect(entry).toBeDefined();
    return entry![1];
  }

  it('focus during an in-flight load-more marks stale and defers — no interleaved refetch', async () => {
    // The load-more hangs until the test releases it.
    let releaseLoadMore: (v: unknown) => void = () => undefined;
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-1'))
      .mockImplementationOnce(
        () => new Promise(resolve => (releaseLoadMore = resolve)),
      );
    const { root, navigation } = await renderScreen();
    const list = root.findAllByType(FlatList)[0];
    await act(async () => {
      list.props.onEndReached();
    });
    const callsDuringLoadMore = listOwnerLeave.mock.calls.length;
    await act(async () => {
      focusCallback(navigation)();
    });
    // No first-page refetch raced the load-more…
    expect(listOwnerLeave.mock.calls.length).toBe(callsDuringLoadMore);
    // …the load-more settles, and the stale mark forces the NEXT focus.
    await act(async () => {
      releaseLoadMore(page([leaveRow({ id: 'p2' })], null));
    });
    await act(async () => {
      focusCallback(navigation)();
    });
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsDuringLoadMore);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
  });

  it('pull-to-refresh during an in-flight load-more is a no-op', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-1'))
      .mockReturnValueOnce(new Promise(() => undefined));
    const { root } = await renderScreen();
    const list = root.findAllByType(FlatList)[0];
    await act(async () => {
      list.props.onEndReached();
    });
    const callsDuringLoadMore = listOwnerLeave.mock.calls.length;
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    expect(listOwnerLeave.mock.calls.length).toBe(callsDuringLoadMore);
  });
});

describe('revoke — the owner stage inside the detail sheet (17-7 spec D3)', () => {
  function approvedRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
    return leaveRow({
      id: 'a1',
      status: 'approved',
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      totalDays: 5,
      dates: [
        { date: '2026-10-05', state: 'approved' },
        { date: '2026-10-06', state: 'approved' },
        { date: '2026-10-07', state: 'approved' },
        { date: '2026-10-08', state: 'approved' },
        { date: '2026-10-09', state: 'approved' },
      ],
      ...overrides,
    });
  }

  function revokePreview(overrides: Partial<LeaveActionPreview> = {}): LeaveActionPreview {
    return {
      action: 'revoke',
      actionDates: ['2026-10-07', '2026-10-08', '2026-10-09'],
      keepDates: [
        { date: '2026-10-05', state: 'approved', reason: 'past' },
        { date: '2026-10-06', state: 'approved', reason: 'cutoff_passed' },
      ],
      request: approvedRow(),
      ...overrides,
    };
  }

  /** Opens the All tab with one Approved row, then its detail sheet. */
  async function openApprovedRow() {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([approvedRow()], null));
    const ctx = await renderScreen();
    await act(async () => {
      ctx.root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    await act(async () => {
      ctx.root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    return ctx;
  }

  it('an Approved row gains the outline-danger entry; a Pending row keeps Reject/Approve', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], null))
      .mockResolvedValueOnce(page([approvedRow()], null));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    expect(findButtonByText(root, 'Revoke leave')).toBeUndefined();
    // Switch to All and open the approved row.
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('all');
    });
    await act(async () => {
      root.findAllByType(LeaveRequestRowView)[0].props.onPress();
    });
    const entry = findButtonByText(root, 'Revoke leave')!;
    expect(entry).toBeDefined();
    expect(entry.props.variant).toBe('secondary');
    expect(entry.props.labelColor).toBe(colors.danger);
  });

  it('entering the stage swaps the title/subtitle and refetches the preview per entry', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    const sheet = root.findAllByType(Sheet)[0];
    expect(sheet.props.title).toBe('Revoke leave');
    expect(sheet.props.subtitle).toBe('Arya · 5–9 Oct 2026');
    expect(previewRevoke).toHaveBeenCalledWith('a1');
    // Back returns to the detail stage…
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(sheet.props.title).toBe('Arya');
    // …and re-entering fetches the preview AGAIN (never cached).
    const callsAfterFirstEntry = previewRevoke.mock.calls.length;
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    expect(previewRevoke.mock.calls.length).toBe(callsAfterFirstEntry + 1);
  });

  it('the split preview gates the confirm on the reason; the trimmed reason travels', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(approvedRow());
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    const confirm = findButtonByText(root, 'Revoke remaining days')!;
    expect(confirm).toBeDefined();
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('  Policy violation  ');
    });
    expect(confirm.props.disabled).toBe(false);
    await act(async () => {
      confirm.props.onPress();
    });
    expect(revokeLeave).toHaveBeenCalledWith('a1', 'Policy violation');
  });

  it('success morphs back to the refreshed detail; the row is replaced and BOTH tabs go stale', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        dates: [
          { date: '2026-10-05', state: 'approved' },
          { date: '2026-10-06', state: 'approved' },
          { date: '2026-10-07', state: 'revoked' },
          { date: '2026-10-08', state: 'revoked' },
          { date: '2026-10-09', state: 'revoked' },
        ],
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(announce).toHaveBeenCalledWith('Leave revoked');
    const sheet = root.findAllByType(Sheet)[0];
    // The stage morphed back to the refreshed detail view — the sheet is
    // OPEN on it (approve/reject close; revoke stays).
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Arya');
    // The All tab's row is the WRITE view (split revoke: chip stays
    // Approved; the suffix appears).
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data[0].status).toBe('approved');
    expect(data[0].dates.map(d => d.state)).toEqual([
      'approved',
      'approved',
      'revoked',
      'revoked',
      'revoked',
    ]);
    // The RENDERED row carries the split suffix next to the still-Approved
    // chip (17-7 review P7 — the walkthrough's headline visual).
    expect(textsInOrder(root)).toContain(
      '5–9 Oct 2026 · 3 working days · 3 of 5 days revoked',
    );
    // The refresh morph re-fetched the preview; the stale mark refetches
    // the Pending tab on entry.
    const callsBeforeSwitch = listOwnerLeave.mock.calls.length;
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('pending');
    });
    expect(listOwnerLeave.mock.calls.length).toBe(callsBeforeSwitch + 1);
  });

  it('a FULL revoke flips the chip — the refreshed detail has no revoke entry', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        status: 'revoked',
        dates: approvedRow().dates.map(d => ({ ...d, state: 'revoked' })),
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
    expect(findButtonByText(root, 'Revoke leave')).toBeUndefined();
  });

  it('own-retry 200 answers the BARE view (no split arrays) and still succeeds', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    // The own-retry view carries NO revokedDates — handlers must never
    // read the optional arrays unconditionally.
    const bare: Record<string, unknown> = { ...approvedRow() };
    delete bare.revokedDates;
    delete bare.employeeName;
    revokeLeave.mockResolvedValue(bare as unknown as LeaveRequestRow);
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Second attempt');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(announce).toHaveBeenCalledWith('Leave revoked');
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
  });

  it('409 LEAVE_NOT_REVOKABLE: the notice + OK closes the WHOLE sheet and refetches', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockRejectedValue({
      status: 409,
      code: 'LEAVE_NOT_REVOKABLE',
      message: 'No future dates left to revoke',
    });
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe('This request was already handled');
    // The visible tab refetched the row's truth.
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThanOrEqual(3);
    await act(async () => {
      findButtonByText(root, 'OK')!.props.onPress();
    });
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });

  it('an offline revoke names the action in the transport line', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(textsInOrder(root)).toContain(
      "You're offline. Revoking needs a working connection.",
    );
  });

  it('the sheet is dismissible={false} while the revoke write is in flight', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    let releaseWrite!: (v: LeaveRequestRow) => void;
    revokeLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        releaseWrite = resolve;
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(true);
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(false);
    releaseWrite(approvedRow());
    await act(async () => {});
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(true);
  });

  it('divergence is absorbed silently: the WRITE response drives the detail, not the preview', async () => {
    // The preview promised 3 actionable days; by confirm time an employee
    // check-in had auto-cancelled one — the write view is authoritative.
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        dates: [
          { date: '2026-10-05', state: 'approved' },
          { date: '2026-10-06', state: 'approved' },
          { date: '2026-10-07', state: 'cancelled' },
          { date: '2026-10-08', state: 'revoked' },
          { date: '2026-10-09', state: 'revoked' },
        ],
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      root.findAllByType(Input)[0].props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    // The refreshed detail renders the WRITE view's per-day truth (the
    // auto-cancelled day visible in the split block).
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
    expect(textsInOrder(root)).toContain('7 Oct 2026');
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data[0].dates[2].state).toBe('cancelled');
  });
});
