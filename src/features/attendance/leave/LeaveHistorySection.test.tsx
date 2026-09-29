/**
 * Section tests for `LeaveHistorySection` (Story 17-6, spec §5 — the
 * employee surface): compact rows (dates line first, count + part-day
 * caption, split suffix, status chip right); a row tap opens the SAME
 * detail sheet READ-ONLY (identity block hidden, actions absent, the
 * reason and per-day split block visible); "Load more" appends and only
 * renders while a cursor remains; the empty state is the single muted
 * line (never an EmptyState); a load failure with nothing loaded shows
 * the inline error.
 *
 * RTR gotchas honoured: text matching flattens; row taps drive the Row's
 * own props (the Card/Pressable mirrors duplicate a11y labels).
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listMyLeave: jest.fn(),
  },
}));

// The section renders outside a navigator here — the tab suite's idiom.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { attendanceLeaveService } from '../../../services';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveDetailSheet } from './LeaveDetailSheet';
import { LeaveRequestRow as Row } from './LeaveRequestRow';
import { LeaveHistorySection } from './LeaveHistorySection';

const listMyLeave = attendanceLeaveService.listMyLeave as jest.Mock;

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
