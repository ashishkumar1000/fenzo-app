/**
 * NotificationsScreen + NotificationRow — what the SCREEN decides (the store
 * behind it has its own tests): the row-tap deep-link contract (navigate to
 * JobDetail + optimistic mark-read), the "Mark all read" disabled state, the
 * error/Retry view, the with-data error banners (load + mutation), and the
 * empty state's "Go to jobs" CTA. The store module is mocked with plain
 * fixtures, so nothing here touches the network.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  };
});

/** Swappable store fixture — each test shapes the list it needs. */
let mockStore: {
  items: ApiNotification[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  mutationError: string | null;
  hasLoaded: boolean;
};
const mockLoadNotifications = jest.fn();
const mockLoadMoreNotifications = jest.fn();
const mockLoadUnreadCount = jest.fn();
const mockRefresh = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();

jest.mock('../src/features/notifications/useNotifications', () => ({
  // The screen reads the store through the hook...
  useNotifications: () => ({
    ...mockStore,
    loadNotifications: mockLoadNotifications,
    loadMoreNotifications: mockLoadMoreNotifications,
    loadUnreadCount: mockLoadUnreadCount,
    refresh: mockRefresh,
    markNotificationRead: mockMarkNotificationRead,
    markAllNotificationsRead: mockMarkAllNotificationsRead,
  }),
  // ...and drives it through the module-level loaders on focus.
  loadNotifications: (...args: unknown[]) => mockLoadNotifications(...args),
  loadMoreNotifications: (...args: unknown[]) => mockLoadMoreNotifications(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
}));

import NotificationsScreen from '../src/features/notifications/NotificationsScreen';
import { NotificationRow, rowTitle } from '../src/features/notifications/components/NotificationRow';
import { Button, InlineError } from '../src/components/ui';
import type { ApiNotification } from '../src/services';

const Screen = NotificationsScreen as unknown as React.FC<{
  navigation: typeof mockNavigation;
}>;

function makeNotification(id: string, overrides: Partial<ApiNotification> = {}): ApiNotification {
  return {
    id,
    jobId: `job-${id}`,
    eventType: 'on_my_way',
    payload: { job_number: 'JB-2026-0042', step: 'on_my_way', technician_name: 'Priya' },
    readAt: null,
    createdAt: '2026-09-09T11:59:30Z', // <1min before NOW-ish → "Just now"
    ...overrides,
  };
}

function emptyStore(overrides: Partial<typeof mockStore> = {}): typeof mockStore {
  return {
    items: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    mutationError: null,
    hasLoaded: true,
    ...overrides,
  };
}

async function mountScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(Screen, { navigation: mockNavigation }),
    );
  });
  return renderer;
}

/** The header's "Mark all read" button, found by its label. */
function markAllButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  const match = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Mark all read');
  if (!match) throw new Error('"Mark all read" button not rendered');
  return match;
}

beforeEach(() => {
  mockStore = emptyStore();
  mockRefresh.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Deep-link contract (the story's core AC) ---------------------------------

it('tapping a row navigates to that job\'s JobDetail AND marks it read', async () => {
  mockStore = emptyStore({ items: [makeNotification('n1')] });
  const renderer = await mountScreen();

  await act(async () => {
    renderer.root.findByType(NotificationRow).props.onPress(
      mockStore.items[0],
    );
  });

  expect(mockNavigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'job-n1' });
  expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
});

// --- Header action --------------------------------------------------------------

it('"Mark all read" is disabled with no rows and enabled with rows', async () => {
  const empty = await mountScreen();
  expect(markAllButton(empty).props.disabled).toBe(true);

  mockStore = emptyStore({ items: [makeNotification('n1')] });
  const withRows = await mountScreen();
  expect(markAllButton(withRows).props.disabled).toBe(false);
});

it('pressing "Mark all read" invokes the store mutation', async () => {
  mockStore = emptyStore({ items: [makeNotification('n1')] });
  const renderer = await mountScreen();

  await act(async () => {
    markAllButton(renderer).props.onPress();
  });
  expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
});

// --- Error views ----------------------------------------------------------------

it('a failed load with no data shows the non-dismissible banner + Retry', async () => {
  mockStore = emptyStore({ error: 'Network offline' });
  const renderer = await mountScreen();

  const text = renderer.root.findAllByType(InlineError);
  expect(text).toHaveLength(1);
  expect(text[0].props.message).toBe('Network offline');
  expect(text[0].props.onDismiss).toBeUndefined(); // Retry is the way out

  const retry = renderer.root.findAllByType(Button).find(b => b.props.children === 'Retry');
  expect(retry).toBeDefined();
  await act(async () => {
    retry?.props.onPress();
  });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('a failed refresh with rows on screen keeps the rows behind a dismissible banner', async () => {
  mockStore = emptyStore({ items: [makeNotification('n1')], error: 'Still offline' });
  const renderer = await mountScreen();

  expect(renderer.root.findAllByType(InlineError)).toHaveLength(1);
  expect(renderer.root.findByType(NotificationRow)).toBeDefined(); // rows kept

  await act(async () => {
    renderer.root.findByType(InlineError).props.onDismiss();
  });
  expect(renderer.root.findAllByType(InlineError)).toHaveLength(0);
  expect(renderer.root.findByType(NotificationRow)).toBeDefined(); // still kept
});

it('a failed mutation surfaces its own banner (the list itself looks normal)', async () => {
  mockStore = emptyStore({
    items: [makeNotification('n1')],
    mutationError: 'Could not save',
  });
  const renderer = await mountScreen();

  const banners = renderer.root.findAllByType(InlineError);
  expect(banners).toHaveLength(1); // the mutation error, not a list error
  expect(banners[0].props.message).toBe('Could not save');
});

// --- Empty state ----------------------------------------------------------------

it('the empty state renders and its CTA navigates to the Jobs tab (not goBack)', async () => {
  const renderer = await mountScreen();

  const cta = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Go to jobs');
  expect(cta).toBeDefined();

  await act(async () => {
    cta?.props.onPress();
  });
  // The spec's "CTA back to jobs": the Jobs TAB, never a plain goBack (from
  // the Home bell that would land on Home — the CTA would lie).
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Jobs', { scope: 'today' });
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
});

// --- Focus behaviour ------------------------------------------------------------

it('refetches the list and the badge on focus, unforced (the store throttles)', async () => {
  await mountScreen();
  expect(mockLoadNotifications).toHaveBeenCalledTimes(1);
  expect(mockLoadNotifications).toHaveBeenCalledWith();
  expect(mockLoadUnreadCount).toHaveBeenCalledWith();
});

// --- NotificationRow ------------------------------------------------------------

describe('NotificationRow', () => {
  it('renders "Technician · JobNumber" from the payload with the step label', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(NotificationRow, {
          notification: makeNotification('n1'),
          onPress: jest.fn(),
        }),
      );
    });
    const label = renderer.root.findByProps({ accessibilityRole: 'button' }).props
      .accessibilityLabel as string;
    expect(label).toContain('Priya · JB-2026-0042');
    expect(label).toContain('On my way');
  });

  it('a partial payload collapses the whole title to the generic copy', () => {
    expect(rowTitle({ job_number: 'JB-1' })).toBe('Job status updated');
    expect(rowTitle({})).toBe('Job status updated');
  });

  it('only unread rows carry the "Unread." announcement prefix', () => {
    const unread = makeNotification('n1');
    const read = makeNotification('n2', { readAt: '2026-09-09T11:00:00Z' });
    const onPress = jest.fn();

    let a!: ReactTestRenderer.ReactTestRenderer;
    let b!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      a = ReactTestRenderer.create(
        React.createElement(NotificationRow, { notification: unread, onPress }),
      );
      b = ReactTestRenderer.create(
        React.createElement(NotificationRow, { notification: read, onPress }),
      );
    });
    const labelOf = (r: ReactTestRenderer.ReactTestRenderer) =>
      r.root.findByProps({ accessibilityRole: 'button' }).props
        .accessibilityLabel as string;
    expect(labelOf(a).startsWith('Unread.')).toBe(true);
    expect(labelOf(b).startsWith('Unread.')).toBe(false);
  });

  it('pressing the row hands the notification back to the caller', () => {
    const onPress = jest.fn();
    const notification = makeNotification('n1');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(NotificationRow, { notification, onPress }),
      );
    });
    act(() => {
      renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith(notification);
  });
});