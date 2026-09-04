/**
 * CustomerDetailScreen's fetch/state branches (ACs 1–5): fetch on mount with
 * the route's customerId, the profile card, history rows (jobNumber, badge,
 * date, service label), row-tap navigation to JobDetail, cursor pagination
 * with id-based dedupe, the empty-history state (profile card still visible),
 * and the not-available view on 404, plus the silent refetch when the screen
 * regains focus (e.g. back from JobDetail after a status change).
 *
 * Navigation hooks are stubbed (the route/navigate shape is static), and the
 * services layer is mocked at the module boundary — the screen's logic under
 * test is its state machine, not the client. The timezone is pinned centrally
 * in jest.setup.js (the date assertions must not depend on the host TZ).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, FlatList, Text } from 'react-native';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
// Captured focus callback — a test simulates "the screen regained focus" by
// invoking it (the real hook fires on mount focus and on every refocus).
let mockFocusCb: (() => void) | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    canGoBack: jest.fn(() => true),
    navigate: mockNavigate,
  }),
  useRoute: () => ({ params: { customerId: 'c-1' } }),
  useFocusEffect: (cb: () => void) => {
    mockFocusCb = cb;
  },
}));

jest.mock('../src/services', () => ({
  customerService: { getById: jest.fn() },
}));

// Linking is side-effecting device surface — never real in tests.
jest.mock('../src/utils/linking', () => ({
  openTel: jest.fn(),
}));

import CustomerDetailScreen from '../src/features/customerDetail/CustomerDetailScreen';
import { customerService } from '../src/services';
import { Avatar, Badge, EmptyState } from '../src/components/ui';
import type { CustomerDetail, JobHistoryItem } from '../src/services';

const getById = customerService.getById as jest.Mock;

function makeHistory(id: string, overrides: Partial<JobHistoryItem> = {}): JobHistoryItem {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    scheduledStart: '2026-08-12T10:00:00Z',
    status: 'scheduled',
    serviceType: 'plumbing',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: 'c-1',
    name: 'Ravi Kumar',
    countryCode: '+91',
    phoneNumber: '9000000002',
    address: '12 Anna Nagar',
    city: 'Chennai',
    createdVia: 'manual',
    createdAt: '2026-06-01T09:00:00Z',
    tenantId: 't1',
    jobHistory: {
      data: [],
      nextCursor: null,
      hasMore: false,
    },
    ...overrides,
  };
}

type Renderer = ReactTestRenderer.ReactTestRenderer;

function renderedText(renderer: Renderer): string {
  return renderer.root
    .findAllByType(Text)
    .map(node =>
      Array.isArray(node.props.children)
        ? node.props.children.filter(c => typeof c === 'string').join(' ')
        : String(node.props.children),
    )
    .join('\n');
}

async function mountScreen(): Promise<Renderer> {
  let renderer!: Renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CustomerDetailScreen />);
  });
  return renderer;
}

/**
 * Walks up from a text node to the nearest ancestor with an onPress — the
 * Card wrapping a history row. Avoids depending on Card's internal structure.
 */
function pressableAncestor(node: ReactTestRenderer.ReactTestInstance) {
  let current: ReactTestRenderer.ReactTestInstance | null = node;
  while (current) {
    if (typeof current.props.onPress === 'function') return current;
    current = current.parent;
  }
  return null;
}

function firstRowCard(renderer: Renderer) {
  const jobNumberText = renderer.root.find(
    node => node.type === Text && node.props.children === 'JB-2026-j-9',
  );
  return pressableAncestor(jobNumberText);
}

afterEach(() => {
  jest.clearAllMocks();
});

it('shows the spinner while the first load is in flight, then the profile + history', async () => {
  let release!: () => void;
  getById.mockImplementationOnce(
    () =>
      new Promise<CustomerDetail>(res => {
        release = () =>
          res(makeDetail({ jobHistory: { data: [makeHistory('a')], nextCursor: null, hasMore: false } }));
      }),
  );

  try {
    let renderer!: Renderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CustomerDetailScreen />);
    });

    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(FlatList).length).toBe(0);

    await ReactTestRenderer.act(async () => {
      release();
    });

    const text = renderedText(renderer);
    expect(renderer.root.findAllByType(Avatar).length).toBeGreaterThan(0);
    expect(text).toContain('Ravi Kumar'); // header title + profile card
    expect(text).toContain('+91 9000000002'); // formatted phone
    expect(text).toContain('Chennai · 12 Anna Nagar'); // customerLocation
    expect(text).toMatch(/Customer since\s+1 Jun 2026/);
    expect(text).toContain('Job history');
    expect(text).toContain('JB-2026-a'); // history row
    // First load passes no cursor.
    expect(getById).toHaveBeenCalledWith('c-1', undefined, expect.anything());
  } finally {
    release();
  }
});

it('renders history rows as given: jobNumber, badge, date, service label', async () => {
  getById.mockResolvedValue(
    makeDetail({
      jobHistory: {
        data: [
          makeHistory('a', { status: 'completed', serviceType: 'ac_service' }),
          makeHistory('b', { status: 'cancelled' }),
        ],
        nextCursor: null,
        hasMore: false,
      },
    }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain('JB-2026-a');
  expect(text).toContain('Done'); // badge label
  expect(text).toContain('12 Aug 2026'); // en-IN date line
  expect(text).toContain('AC service');
  expect(text).toContain('Cancelled');
  expect(renderer.root.findAllByType(Badge).length).toBe(2);
});

it('pushes JobDetail with the row id when a history row is tapped (AC 3)', async () => {
  getById.mockResolvedValue(
    makeDetail({ jobHistory: { data: [makeHistory('j-9')], nextCursor: null, hasMore: false } }),
  );
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    firstRowCard(renderer)!.props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('JobDetail', { jobId: 'j-9' });
});

it('load-more fetches with the cursor and appends without duplicate ids (AC 2)', async () => {
  getById
    .mockResolvedValueOnce(
      makeDetail({
        jobHistory: { data: [makeHistory('a'), makeHistory('b')], nextCursor: 'cur-1', hasMore: true },
      }),
    )
    // The same row id may already be on screen (a refresh racing the
    // load-more) — the append must dedupe by id.
    .mockResolvedValueOnce({
      ...makeDetail(),
      jobHistory: { data: [makeHistory('b'), makeHistory('c')], nextCursor: null, hasMore: false },
    });
  const renderer = await mountScreen();

  expect(historyRowsOf(renderer).map(row => row.id)).toEqual(['a', 'b']);

  const flatList = renderer.root.findAllByType(FlatList)[0];
  await ReactTestRenderer.act(async () => {
    await flatList.props.onEndReached();
  });

  expect(getById).toHaveBeenLastCalledWith('c-1', 'cur-1', expect.anything());
  expect(historyRowsOf(renderer).map(row => row.id)).toEqual(['a', 'b', 'c']);
  expect(renderedText(renderer).match(/JB-2026-b/g)).toHaveLength(1); // b rendered once
});

it('shows the empty-history state with the profile card still rendered (AC 4)', async () => {
  getById.mockResolvedValue(makeDetail()); // empty history
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(renderer.root.findAllByType(EmptyState).length).toBe(1);
  expect(text).toContain('No jobs yet');
  expect(text).toContain('Jobs for this customer will appear here.');
  // The profile card is not lost to the empty state.
  expect(text).toContain('Ravi Kumar');
  expect(renderer.root.findAllByType(FlatList).length).toBe(1);
});

it('renders the not-available view on 404, not the spinner or list (AC 5)', async () => {
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Not found'), { status: 404, code: 'CUSTOMER_NOT_FOUND' }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(renderer.root.findAllByType(EmptyState).length).toBe(1);
  expect(text).toContain("This customer isn't available");
  expect(text).toContain('Go back');
  expect(renderer.root.findAllByType(FlatList).length).toBe(0);
});

it('shows the inline error + Retry for non-404 failures (AC 5)', async () => {
  getById.mockRejectedValueOnce(Object.assign(new Error('Network offline')));
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain('Network offline');
  expect(renderedText(renderer)).toContain('Retry');
  expect(renderer.root.findAllByType(EmptyState).length).toBe(0);

  // Retry refetches.
  getById.mockResolvedValueOnce(makeDetail());
  const retry = renderer.root.find(node => node.type === Text && node.props.children === 'Retry');
  await ReactTestRenderer.act(async () => {
    pressableAncestor(retry)!.props.onPress();
  });
  expect(getById).toHaveBeenCalledTimes(2);
});

it('pull-to-refresh refetches the first page and resets the cursor state (AC 5)', async () => {
  getById
    .mockResolvedValueOnce(
      makeDetail({
        jobHistory: { data: [makeHistory('a')], nextCursor: 'cur-1', hasMore: true },
      }),
    )
    .mockResolvedValueOnce(
      makeDetail({
        jobHistory: { data: [makeHistory('a'), makeHistory('new')], nextCursor: null, hasMore: false },
      }),
    );
  const renderer = await mountScreen();

  const flatList = renderer.root.findAllByType(FlatList)[0];
  await ReactTestRenderer.act(async () => {
    flatList.props.refreshControl.props.onRefresh();
  });

  expect(getById).toHaveBeenLastCalledWith('c-1', undefined, expect.anything());
  expect(historyRowsOf(renderer).map(row => row.id)).toEqual(['a', 'new']);
  expect(renderedText(renderer).match(/JB-2026-new/g)).toHaveLength(1);
});

function historyRowsOf(renderer: Renderer): JobHistoryItem[] {
  return renderer.root.findAllByType(FlatList)[0].props.data;
}

it('skips the initial focus but silently refetches page 1 on a later focus', async () => {
  let release!: () => void;
  getById
    .mockImplementationOnce(
      () =>
        new Promise<CustomerDetail>(res => {
          release = () =>
            res(
              makeDetail({
                jobHistory: { data: [makeHistory('a')], nextCursor: 'cur-1', hasMore: true },
              }),
            );
        }),
    )
    // The refetch must resolve — a fresh page 1 (a new row, new cursor) that
    // replaces the on-screen content, exactly as production would.
    .mockResolvedValueOnce(
      makeDetail({
        jobHistory: { data: [makeHistory('a'), makeHistory('b')], nextCursor: 'cur-2', hasMore: true },
      }),
    );
  try {
    let renderer!: Renderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CustomerDetailScreen />);
    });

    // The initial focus (while the mount fetch is still in flight) must not
    // start a second fetch — the mount fetch covers it.
    await ReactTestRenderer.act(async () => {
      mockFocusCb!();
    });
    expect(getById).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      release();
    });

    // Returning from JobDetail → focus again → silent page-1 refetch (no
    // cursor), history replaced with the fresh first page.
    await ReactTestRenderer.act(async () => {
      mockFocusCb!();
    });
    expect(getById).toHaveBeenCalledTimes(2);
    expect(getById).toHaveBeenLastCalledWith('c-1', undefined, expect.anything());
    expect(historyRowsOf(renderer).map(row => row.id)).toEqual(['a', 'b']);
  } finally {
    release();
  }
});