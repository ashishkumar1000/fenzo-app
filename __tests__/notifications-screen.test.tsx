/**
 * NotificationsScreen + NotificationCard — what the SCREEN decides (the
 * store behind it has its own tests): the card-tap deep-link contract
 * (navigate to JobDetail + optimistic mark-read of the card's unread
 * events), the All/Active/Completed filter chips, the "Mark all read"
 * disabled state, the error/Retry view, the with-data error banners
 * (load + mutation), and the empty state's "Go to jobs" CTA. The store
 * module is mocked with plain fixtures, so nothing here touches the network.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

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
import { NotificationCard } from '../src/features/notifications/components/NotificationCard';
import { NotificationFilterBar } from '../src/features/notifications/components/NotificationFilterBar';
import { Avatar, Button, InlineError } from '../src/components/ui';
import type { ApiNotification } from '../src/services';
import type { NotificationCardData } from '../src/features/notifications/notificationCardModel';

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

it('tapping a card navigates to that job\'s JobDetail AND marks it read', async () => {
  mockStore = emptyStore({ items: [makeNotification('n1')] });
  const renderer = await mountScreen();

  await act(async () => {
    renderer.root.findByType(NotificationCard).props.onPress(
      renderer.root.findByType(NotificationCard).props.card,
    );
  });

  expect(mockNavigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'job-n1' });
  expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
});

it('tapping a card marks ALL of that job\'s unread events read', async () => {
  mockStore = emptyStore({
    items: [
      makeNotification('n1', {
        jobId: 'job-shared',
        payload: { job_number: 'JB-2026-0042', step: 'in_progress', technician_name: 'Priya' },
      }),
      makeNotification('n2', {
        jobId: 'job-shared',
        payload: { job_number: 'JB-2026-0042', step: 'on_my_way', technician_name: 'Priya' },
      }),
    ],
  });
  const renderer = await mountScreen();

  await act(async () => {
    const card = renderer.root.findByType(NotificationCard);
    card.props.onPress(card.props.card);
  });

  expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
  expect(mockMarkNotificationRead).toHaveBeenCalledWith('n2');
});

it('the card\'s "View Job" footer button runs the same navigate-first contract', async () => {
  mockStore = emptyStore({ items: [makeNotification('n1')] });
  const renderer = await mountScreen();

  const viewJob = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'View Job');
  expect(viewJob).toBeDefined();
  await act(async () => {
    viewJob?.props.onPress();
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
  expect(renderer.root.findByType(NotificationCard)).toBeDefined(); // rows kept

  await act(async () => {
    renderer.root.findByType(InlineError).props.onDismiss();
  });
  expect(renderer.root.findAllByType(InlineError)).toHaveLength(0);
  expect(renderer.root.findByType(NotificationCard)).toBeDefined(); // still kept
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

// --- NotificationCard ------------------------------------------------------------

describe('NotificationCard', () => {
  it('announces "Technician · JobNumber" with the step label and unread prefix', () => {
    mockStore = emptyStore({ items: [makeNotification('n1')] });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(Screen, { navigation: mockNavigation }),
      );
    });
    const label = renderer.root.findByType(NotificationCard).props.card;
    // The card derives its copy through the model — asserted via the grouped
    // data the screen hands it (title/step rendering is the model's tests).
    expect(label.jobNumber).toBe('JB-2026-0042');
    expect(label.technicianName).toBe('Priya');
    expect(label.currentStep).toBe('on_my_way');
    expect(label.isUnread).toBe(true);
  });

  it('a read event produces a read card (no unread announcement data)', async () => {
    mockStore = emptyStore({
      items: [makeNotification('n1', { readAt: '2026-09-09T11:00:00Z' })],
    });
    const renderer = await mountScreen();
    const card = renderer.root.findByType(NotificationCard).props
      .card as NotificationCardData;
    expect(card.isUnread).toBe(false);
    expect(card.unreadIds).toEqual([]);
  });

  // The old NotificationRow tests pinned the RENDERED label; these keep that
  // pin — model-data assertions above would pass even if the component
  // rendered a raw step key or dropped the unread prefix.
  it('the rendered label carries the unread prefix, title and step label', async () => {
    mockStore = emptyStore({ items: [makeNotification('n1')] });
    const renderer = await mountScreen();
    const label = renderer.root
      .findByType(NotificationCard)
      .findByProps({ accessibilityRole: 'button' }).props
      .accessibilityLabel as string;
    expect(label).toContain('Unread. ');
    expect(label).toContain('Priya · JB-2026-0042');
    expect(label).toContain('ON MY WAY'); // uppercased in JS, not textTransform
  });

  it('a drifted payload renders the generic copy and no avatar', async () => {
    mockStore = emptyStore({ items: [makeNotification('n1', { payload: {} })] });
    const renderer = await mountScreen();
    const card = renderer.root.findByType(NotificationCard);
    const label = card.findByProps({ accessibilityRole: 'button' }).props
      .accessibilityLabel as string;
    expect(label).toContain('Job status updated');
    // No name, no avatar — a blank initials circle would read as a bug.
    expect(card.findAllByType(Avatar)).toHaveLength(0);
  });
});

// --- Filter chips -----------------------------------------------------------------

describe('filter chips', () => {
  async function mountWithActiveAndCompleted() {
    mockStore = emptyStore({
      items: [
        makeNotification('n1', {
          jobId: 'job-done',
          payload: { job_number: 'JB-2026-0005', step: 'completed', technician_name: 'Ashish' },
          readAt: '2026-09-09T11:00:00Z',
        }),
        makeNotification('n2', {
          jobId: 'job-active',
          payload: { job_number: 'JB-2026-0007', step: 'in_progress', technician_name: 'Dinesh' },
        }),
      ],
    });
    return mountScreen();
  }

  it('shows all cards under "all" and narrows by the selected chip', async () => {
    const renderer = await mountWithActiveAndCompleted();
    expect(renderer.root.findAllByType(NotificationCard)).toHaveLength(2);

    await act(async () => {
      renderer.root.findByType(NotificationFilterBar).props.onChange('completed');
    });
    const completedCards = renderer.root.findAllByType(NotificationCard);
    expect(completedCards).toHaveLength(1);
    expect(completedCards[0].props.card.jobId).toBe('job-done');

    await act(async () => {
      renderer.root.findByType(NotificationFilterBar).props.onChange('active');
    });
    const activeCards = renderer.root.findAllByType(NotificationCard);
    expect(activeCards).toHaveLength(1);
    expect(activeCards[0].props.card.jobId).toBe('job-active');
  });

  it('an empty filter result shows the quiet line, not the "no notifications yet" state', async () => {
    mockStore = emptyStore({ items: [makeNotification('n1')] }); // an active job
    const renderer = await mountScreen();

    await act(async () => {
      renderer.root.findByType(NotificationFilterBar).props.onChange('completed');
    });
    expect(renderer.root.findAllByType(NotificationCard)).toHaveLength(0);
    const text = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(text).toContain('No completed jobs yet.');
    // The real empty state (with its CTA) is NOT shown — rows exist.
    expect(
      renderer.root.findAllByType(Button).find(b => b.props.children === 'Go to jobs'),
    ).toBeUndefined();
  });

  it('chip labels carry the loaded counts', async () => {
    const renderer = await mountWithActiveAndCompleted();
    const bar = renderer.root.findByType(NotificationFilterBar);
    expect(bar.props.counts).toEqual({ all: 2, active: 1, completed: 1 });
  });

  it('a drifted card counts as active — and the chips agree with the filter', async () => {
    mockStore = emptyStore({ items: [makeNotification('n1', { payload: {} })] });
    const renderer = await mountScreen();

    expect(renderer.root.findByType(NotificationFilterBar).props.counts).toEqual({
      all: 1,
      active: 1,
      completed: 0,
    });
    await act(async () => {
      renderer.root.findByType(NotificationFilterBar).props.onChange('active');
    });
    expect(renderer.root.findAllByType(NotificationCard)).toHaveLength(1);
    await act(async () => {
      renderer.root.findByType(NotificationFilterBar).props.onChange('completed');
    });
    expect(renderer.root.findAllByType(NotificationCard)).toHaveLength(0);
  });
});
