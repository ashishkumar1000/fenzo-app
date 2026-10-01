/**
 * Section tests for `LeaveHistorySection` (Story 17-6, spec §5 — the
 * employee surface; 17-7 adds the Cancel wiring): compact rows (dates
 * line first, count + part-day caption, split suffix, status chip right);
 * a row tap opens the SAME detail sheet (identity hidden, the reason and
 * per-day split block visible); "Load more" appends and only renders
 * while a cursor remains; the empty state is the single muted line (never
 * an EmptyState); the first load in flight renders the labelled shimmer;
 * a load failure with nothing loaded shows the inline
 * error. 17-7 (spec D4): Pending/Approved rows gain the outline-danger
 * "Cancel request" entry; the stage swaps the sheet title/subtitle and
 * fetches the preview per entry; the cancel write succeeds with the row
 * replaced + the first page refetched + the announcement; 409
 * LEAVE_NOT_CANCELLABLE closes the whole sheet on OK and refetches; the
 * offline line names the action.
 *
 * RTR gotchas honoured: text matching flattens; row taps drive the Row's
 * own props (the Card/Pressable mirrors duplicate a11y labels); Buttons
 * are driven BY TYPE + children; async work flushes through
 * `await act(async () => {})`.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listMyLeave: jest.fn(),
    previewCancel: jest.fn(),
    cancelLeave: jest.fn(),
  },
}));

// The section renders outside a navigator here — the tab suite's idiom.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { Button, InlineError, InlineNotice, Sheet } from '../../../components/ui';
import { attendanceLeaveService } from '../../../services';
import type { LeaveActionPreview, LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveDetailSheet } from './LeaveDetailSheet';
import { LeaveRequestRow as Row } from './LeaveRequestRow';
import { LeaveHistorySection } from './LeaveHistorySection';

const listMyLeave = attendanceLeaveService.listMyLeave as jest.Mock;
const previewCancel = attendanceLeaveService.previewCancel as jest.Mock;
const cancelLeave = attendanceLeaveService.cancelLeave as jest.Mock;
const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

function compactRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'me',
    startDate: '2026-10-05',
    endDate: '2026-10-07',
    part: 'full_day',
    reason: 'Family event',
    status: 'approved',
    workingDays: 3,
    totalDays: 3,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [
      { date: '2026-10-05', state: 'approved' },
      { date: '2026-10-06', state: 'approved' },
      { date: '2026-10-07', state: 'approved' },
    ],
    ...overrides,
  };
}

function cancelPreview(overrides: Partial<LeaveActionPreview> = {}): LeaveActionPreview {
  return {
    action: 'cancel',
    actionDates: ['2026-10-05', '2026-10-06', '2026-10-07'],
    keepDates: [],
    request: compactRow(),
    ...overrides,
  };
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
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

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

async function renderSection(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<LeaveHistorySection />);
  });
  lastRenderer = renderer;
  return renderer;
}

// Unmounted in afterEach — a root left mounted past the suite can settle a
// fetch promise after the tests, and its setState lands outside act whose
// scheduler tail then bleeds into the next suite in this worker.
let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  listMyLeave.mockResolvedValue(page([], null));
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('the compact rows (spec D3)', () => {
  it('renders dates line first, count + part-day caption, status chip', async () => {
    listMyLeave.mockResolvedValueOnce(
      page(
        [compactRow({ part: 'first_half', endDate: '2026-10-05', workingDays: 1, dates: [{ date: '2026-10-05', state: 'approved' }] })],
        null,
      ),
    );
    const { root } = await renderSection();
    const row = root.findAllByType(Row);
    expect(row).toHaveLength(1);
    expect(row[0].props.variant).toBe('compact');
    expect(texts(root)).toContain('5 Oct 2026');
    expect(texts(root)).toContain('1 working day · First half');
  });

  it('a split request carries the honest suffix on the caption line', async () => {
    listMyLeave.mockResolvedValueOnce(
      page(
        [
          compactRow({
            dates: [
              { date: '2026-10-05', state: 'approved' },
              { date: '2026-10-06', state: 'cancelled' },
              { date: '2026-10-07', state: 'cancelled' },
            ],
          }),
        ],
        null,
      ),
    );
    const { root } = await renderSection();
    expect(texts(root)).toContain('5–7 Oct 2026');
    expect(texts(root)).toContain('3 working days · 2 of 3 days cancelled');
  });

  it('the first load in flight renders the labelled shimmer, not the empty line', async () => {
    listMyLeave.mockReturnValueOnce(new Promise(() => undefined));
    const { root } = await renderSection();
    expect(
      root.findAll(n => n.props.accessibilityLabel === 'Loading attendance').length,
    ).toBeGreaterThan(0);
  });

  it('the empty history renders the single muted line (no EmptyState)', async () => {
    const { root } = await renderSection();
    expect(texts(root)).toContain('No leave requests yet');
    expect(root.findAllByType(InlineError)).toHaveLength(0);
  });

  it('a load failure with nothing loaded shows the inline error', async () => {
    listMyLeave.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await renderSection();
    expect(texts(root)).toContain(
      "Couldn't load leave requests. Check your connection and try again.",
    );
  });
});

describe('the read-only detail sheet (spec D3 — FR-17 closed)', () => {
  it('a row tap opens the sheet read-only: reason quoted, split block visible, NO actions', async () => {
    listMyLeave.mockResolvedValueOnce(
      page(
        [
          compactRow({
            reason: 'Going home',
            dates: [
              { date: '2026-10-05', state: 'approved' },
              { date: '2026-10-06', state: 'revoked' },
              { date: '2026-10-07', state: 'revoked' },
            ],
          }),
        ],
        null,
      ),
    );
    const { root } = await renderSection();
    const sheet = root.findAllByType(LeaveDetailSheet)[0];
    expect(sheet.props.visible).toBe(false);
    expect(sheet.props.readOnly).toBe(true);

    await act(async () => {
      root.findAllByType(Row)[0].props.onPress();
    });
    expect(sheet.props.visible).toBe(true);
    expect(texts(root)).toContain('“Going home”');
    // Per-day states fully visible (the split block).
    expect(texts(root)).toContain('5 Oct 2026');
    expect(texts(root)).toContain('6 Oct 2026');
    expect(texts(root)).toContain('7 Oct 2026');
    // Actions absent; the identity block hidden (title only).
    expect(texts(root).includes('Approve')).toBe(false);
    expect(texts(root).includes('Reject')).toBe(false);
    expect(texts(root).includes('Team member')).toBe(false);
  });
});

describe('Load more (spec D3 — embedded pagination)', () => {
  it('renders only while a cursor remains; appends and announces', async () => {
    listMyLeave
      .mockResolvedValueOnce(page([compactRow({ id: 'r1' })], 'CUR-2'))
      .mockResolvedValueOnce(page([compactRow({ id: 'r2' })], null));
    const { root } = await renderSection();
    const loadMore = root.findAllByType(Button).find(b => b.props.children === 'Load more');
    expect(loadMore).toBeDefined();
    await act(async () => {
      loadMore!.props.onPress();
    });
    expect(listMyLeave).toHaveBeenLastCalledWith({ cursor: 'CUR-2', limit: 10 });
    expect(root.findAllByType(Row).map(r => r.props.request.id)).toEqual(['r1', 'r2']);
    // endReached: the button is gone.
    expect(
      root.findAllByType(Button).find(b => b.props.children === 'Load more'),
    ).toBeUndefined();
  });
});

describe('cancel — the employee stage inside the detail sheet (17-7 spec D4)', () => {
  function pendingRow(): LeaveRequestRow {
    return compactRow({
      status: 'pending',
      dates: [
        { date: '2026-10-05', state: 'pending' },
        { date: '2026-10-06', state: 'pending' },
        { date: '2026-10-07', state: 'pending' },
      ],
    });
  }

  async function openRow(row: LeaveRequestRow) {
    listMyLeave.mockResolvedValueOnce(page([row], null));
    const renderer = await renderSection();
    await act(async () => {
      renderer.root.findAllByType(Row)[0].props.onPress();
    });
    return renderer;
  }

  it('Pending and Approved rows gain the entry; a terminal row does not', async () => {
    const rejected = compactRow({
      id: 'r2',
      status: 'rejected',
      dates: [{ date: '2026-10-05', state: 'rejected' }],
    });
    listMyLeave.mockResolvedValueOnce(page([pendingRow(), rejected], null));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(<LeaveHistorySection />);
    });
    lastRenderer = renderer;
    // Open the PENDING row: the entry is there.
    await act(async () => {
      renderer.root.findAllByType(Row)[0].props.onPress();
    });
    expect(findButtonByText(renderer.root, 'Cancel request')).toBeDefined();
    // Back out, then open the REJECTED row: no entry.
    await act(async () => {
      renderer.root.findAllByType(LeaveDetailSheet)[0].props.onClose();
    });
    await act(async () => {
      renderer.root.findAllByType(Row)[1].props.onPress();
    });
    expect(findButtonByText(renderer.root, 'Cancel request')).toBeUndefined();
  });

  it('entering the stage swaps the title/subtitle and fetches the preview', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    const sheet = renderer.root.findAllByType(Sheet)[0];
    expect(sheet.props.title).toBe('Cancel this leave request?');
    expect(sheet.props.subtitle).toBe('5–7 Oct 2026 · 3 working days');
    expect(previewCancel).toHaveBeenCalledWith('r1');
    expect(findButtonByText(renderer.root, 'Cancel request')!.props.disabled).toBe(false);
  });

  it('success replaces the row, refetches the first page, announces, and morphs back', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    const cancelledView = compactRow({ status: 'cancelled' });
    cancelLeave.mockResolvedValue(cancelledView);
    listMyLeave
      .mockResolvedValueOnce(page([pendingRow()], null)) // initial load
      .mockResolvedValue(page([cancelledView], null)); // the post-write reload
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(<LeaveHistorySection />);
    });
    lastRenderer = renderer;
    await act(async () => {
      renderer.root.findAllByType(Row)[0].props.onPress();
    });
    // Entry press (the detail-stage outline-danger button)…
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    // …then the stage confirm (same label — the whole-request context).
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    expect(cancelLeave).toHaveBeenCalledWith('r1');
    expect(announce).toHaveBeenCalledWith('Leave cancelled');
    // The sheet morphed back to the refreshed detail — OPEN on it.
    const sheet = renderer.root.findAllByType(Sheet)[0];
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Leave request');
    // The row replaced (grey chip) + the first page refetched (cursor reset).
    expect(renderer.root.findAllByType(Row)[0].props.request.status).toBe('cancelled');
    expect(listMyLeave).toHaveBeenCalledTimes(2);
  });

  it('409 LEAVE_NOT_CANCELLABLE: the notice + OK closes the WHOLE sheet and refetches', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    cancelLeave.mockRejectedValue({
      status: 409,
      code: 'LEAVE_NOT_CANCELLABLE',
      message: 'No future dates left to cancel',
    });
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    const notices = renderer.root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe('This request was already handled');
    expect(listMyLeave).toHaveBeenCalledTimes(2); // the truth refetched
    await act(async () => {
      findButtonByText(renderer.root, 'OK')!.props.onPress();
    });
    expect(renderer.root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });

  it('an offline cancel names the action in the transport line', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    cancelLeave.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    const errors = renderer.root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe(
      "You're offline. Cancelling needs a working connection.",
    );
    expect(announce).not.toHaveBeenCalledWith('Leave cancelled');
  });

  it('the split preview (a past-Pending standing reality) confirms with "Cancel remaining days"', async () => {
    previewCancel.mockResolvedValue(
      cancelPreview({
        actionDates: ['2026-10-06', '2026-10-07'],
        keepDates: [{ date: '2026-10-05', state: 'pending', reason: 'past' }],
      }),
    );
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    expect(findButtonByText(renderer.root, 'Cancel remaining days')).toBeDefined();
  });
});

describe('the employee cancel lifecycle gaps (17-7 review triage)', () => {
  function pendingRow(): LeaveRequestRow {
    return compactRow({
      status: 'pending',
      dates: [
        { date: '2026-10-05', state: 'pending' },
        { date: '2026-10-06', state: 'pending' },
        { date: '2026-10-07', state: 'pending' },
      ],
    });
  }

  async function openRow(row: LeaveRequestRow) {
    listMyLeave.mockResolvedValueOnce(page([row], null));
    const renderer = await renderSection();
    await act(async () => {
      renderer.root.findAllByType(Row)[0].props.onPress();
    });
    return renderer;
  }

  it('an APPROVED row gains the entry too (the in-progress cancel case)', async () => {
    const approved = compactRow({
      id: 'r3',
      status: 'approved',
      dates: [
        { date: '2026-10-05', state: 'approved' },
        { date: '2026-10-06', state: 'approved' },
        { date: '2026-10-07', state: 'approved' },
      ],
    });
    listMyLeave.mockResolvedValueOnce(page([approved], null));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(<LeaveHistorySection />);
    });
    lastRenderer = renderer;
    await act(async () => {
      renderer.root.findAllByType(Row)[0].props.onPress();
    });
    expect(findButtonByText(renderer.root, 'Cancel request')).toBeDefined();
    expect(findButtonByText(renderer.root, 'Approve')).toBeUndefined();
    expect(findButtonByText(renderer.root, 'Reject')).toBeUndefined();
  });

  it('re-entering the stage refetches the preview (per-entry, never cached)', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    expect(previewCancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.root.findAllByType(Button).find(b => b.props.children === 'Back')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    expect(previewCancel).toHaveBeenCalledTimes(2);
  });

  it('the sheet is dismissible={false} while the cancel write is in flight', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    let releaseWrite: (v: unknown) => void = () => undefined;
    cancelLeave.mockImplementationOnce(
      () => new Promise(resolve => (releaseWrite = resolve)),
    );
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    const sheet = renderer.root.findAllByType(Sheet)[0];
    expect(sheet.props.dismissible).toBe(false);
    await act(async () => {
      releaseWrite(compactRow({ status: 'cancelled' }));
    });
    await act(async () => {});
  });

  it('an own-retry bare view (no cancelledDates) still lands as success', async () => {
    previewCancel.mockResolvedValue(cancelPreview());
    // The own-retry replay answers the BARE request view — no split
    // arrays ride along; the FE treats any 200 as success.
    const bareView: LeaveRequestRow = compactRow({ status: 'cancelled' });
    cancelLeave.mockResolvedValue(bareView);
    // openRow arms the initial page; the post-write reload gets the
    // cancelled row back.
    listMyLeave.mockResolvedValue(page([bareView], null));
    const renderer = await openRow(pendingRow());
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(renderer.root, 'Cancel request')!.props.onPress();
    });
    expect(announce).toHaveBeenCalledWith('Leave cancelled');
    expect(renderer.root.findAllByType(Row)[0].props.request.status).toBe('cancelled');
  });
});
