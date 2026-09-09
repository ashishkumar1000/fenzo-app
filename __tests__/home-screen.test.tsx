/**
 * HomeScreen — the greeting/first-run branches plus the header stat wiring.
 * The screen's whole surface comes from `GET /users/me` via `useMyProfile`;
 * the user-reported render crash (2026-09-04) happened because nothing
 * verified the payload shape this screen consumes, so this file pins the
 * contract: a profile carrying `jobCounts` must render the header stats
 * without crashing, on both first-run and normal Home.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { RefreshControl, ScrollView } from 'react-native';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) };

/**
 * Captured focus-effect callback — the test for the story-1.4 focus refresh
 * invokes it directly instead of simulating a tab switch.
 */
let focusEffect: (() => void) | null = null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void) => {
    focusEffect = effect;
  },
}));

jest.mock('../src/features/profile', () => ({
  useMyProfile: jest.fn(),
  loadMyProfile: jest.fn(),
  // HomeScreen consumes this to null-safe the greeting — keep the real
  // implementation so a null name still renders the nameless form in tests.
  firstName: jest.requireActual('../src/features/profile').firstName,
}));

jest.mock('../src/features/home', () => ({
  QuickActions: () => null,
  hasAnyJobCount: jest.requireActual('../src/features/home').hasAnyJobCount,
  // Real implementation — Story 1.7's filtering/strip/empty-state behaviour
  // is exactly what these tests pin.
  TodaysJobsSection: jest.requireActual('../src/features/home').TodaysJobsSection,
}));

// Story 3.4: Home mounts the notifications store for its bell — mocked here
// so the mounted screen never fires a real unreadCount request through the
// apiClient module graph, and so the bell tests can drive the count.
let mockUnreadCount: number | null = null;
const mockLoadUnreadCount = jest.fn();
jest.mock('../src/features/notifications', () => ({
  useNotifications: () => ({
    unreadCount: mockUnreadCount,
    loadUnreadCount: mockLoadUnreadCount,
  }),
}));

import HomeScreen from '../src/screens/HomeScreen';
import { loadMyProfile, useMyProfile } from '../src/features/profile';
import { JobCard } from '../src/features/jobs/components/JobCard';
import { OverdueStrip } from '../src/features/home/components/OverdueStrip';
import { TodaysJobsSection } from '../src/features/home/components/TodaysJobsSection';
import { Button } from '../src/components/ui';
import type { MyProfile, ProfileJob } from '../src/services';

const useMyProfileMock = useMyProfile as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

/** A completed-setup owner profile, exactly the shape `/users/me` returns. */
function makeProfile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'u-1',
    name: 'Kumar Selvan',
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'active',
    role: 'owner',
    tenant: {
      id: 't-1',
      companyName: 'Fenzit Services',
      gstin: null,
      address: null,
      stateCode: 'TN',
      serviceCategories: [],
      upiVpa: null,
    },
    technicians: [],
    technicianCount: 2,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
    ...overrides,
  };
}

/** A `/users/me` today-scoped job row, embeds included (fenzit-be Story 3-9). */
function makeProfileJob(overrides: Partial<ProfileJob> = {}): ProfileJob {
  return {
    id: 'j-1',
    jobNumber: 'JB-2026-0001',
    tenantId: 't-1',
    customerId: 'c-1',
    technicianId: 'tech-1',
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-05T04:00:00.000Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-05T03:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-05T03:00:00.000Z',
    technician: {
      id: 'tech-1',
      name: 'Ramesh',
      countryCode: '+91',
      phoneNumber: '9000000001',
      skills: [],
    },
    customer: {
      id: 'c-1',
      name: 'Priya Sharma',
      countryCode: '+91',
      phoneNumber: '9000000002',
      address: null,
      city: null,
    },
    ...overrides,
  };
}

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: { children: unknown[] }) => {
    for (const child of node.children) {
      if (typeof child === 'string') parts.push(child);
      else walk(child as { children: unknown[] });
    }
  };
  walk(renderer.root as unknown as { children: unknown[] });
  return parts.join(' ');
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    // Navigation props are type-only surface — the hooks are mocked above.
    renderer = create(
      React.createElement(HomeScreen, {
        navigation: mockNavigation,
        route: { key: 'Home', name: 'Home' },
      } as never),
    );
  });
  return renderer;
}

afterEach(() => {
  jest.clearAllMocks();
  focusEffect = null;
  mockUnreadCount = null;
});

it('renders the greeting and header stats from the jobCounts buckets', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  const text = allText(renderer);
  expect(text).toContain('Good morning,');
  expect(text).toContain('Fenzit Services');
  // Story 1.5: the tiles show the jobCounts buckets directly (Today 1,
  // Upcoming 2, Overdue 0) — there is no all-time total row any more.
  expect(text).toContain('Today');
  expect(text).toContain('Upcoming');
  expect(text).toContain('Overdue');
  expect(text).toContain('Technicians');
  expect(text).toContain('2');
});

it('treats a zero-count profile as first-run (no jobs yet)', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile({
      technicianCount: 0,
      jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
    }),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  const text = allText(renderer);
  expect(text).toContain('Add a technician first, then you can create and assign jobs.');
  // First-run Home still renders inside a ScrollView.
  expect(renderer.root.findAllByType(ScrollView).length).toBe(1);
});

it('shows the error view (not a crash) when the profile is absent', async () => {
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: false,
    error: 'Something broke',
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  expect(allText(renderer)).toContain("Couldn't load your account");
});

it('refreshes the profile on focus (unforced — the store throttle decides)', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();
  expect(loadMyProfileMock).not.toHaveBeenCalled();

  // Simulate regaining focus: the hook's captured callback is what fires.
  focusEffect?.();
  expect(loadMyProfileMock).toHaveBeenCalledTimes(1);
  expect(loadMyProfileMock).toHaveBeenCalledWith(); // no { force: true }
  // Story 3.4: the bell's badge rides the same focus refresh (unforced —
  // the store's TTL decides).
  expect(mockLoadUnreadCount).toHaveBeenCalledWith();

  await act(async () => {
    renderer.unmount();
  });
});

// --- Stat tiles (Story 1.5) ---------------------------------------------------

/** Finds a header stat tile by the start of its accessibility label. */
function tileFor(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const match = renderer.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(p => typeof p.props.accessibilityLabel === 'string' &&
      (p.props.accessibilityLabel as string).startsWith(label));
  if (!match) throw new Error(`stat tile "${label}" not rendered`);
  return match;
}

function mountWithProfile(overrides: Partial<MyProfile> = {}): Promise<ReactTestRenderer> {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(overrides),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  return mountScreen();
}

it('each job tile carries its count in the accessibility label (subtitle first)', async () => {
  const renderer = await mountWithProfile();

  expect(tileFor(renderer, 'Today').props.accessibilityLabel).toBe('Today 1');
  expect(tileFor(renderer, 'Upcoming').props.accessibilityLabel).toBe('Upcoming 2');
  expect(tileFor(renderer, 'Overdue').props.accessibilityLabel).toBe('Overdue 0');
  expect(tileFor(renderer, 'Technicians').props.accessibilityLabel).toBe('Technicians 2');
});

it('pressing a job tile lands on the Jobs tab pre-set to that scope', async () => {
  const renderer = await mountWithProfile();

  await act(async () => {
    tileFor(renderer, 'Today').props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Jobs', { scope: 'today' });

  await act(async () => {
    tileFor(renderer, 'Upcoming').props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Jobs', { scope: 'upcoming' });

  await act(async () => {
    tileFor(renderer, 'Overdue').props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Jobs', { scope: 'overdue' });
});

it('the Technicians tile is inert (disabled, no Jobs navigation)', async () => {
  const renderer = await mountWithProfile();

  const tile = tileFor(renderer, 'Technicians');
  expect(tile.props.disabled).toBe(true);
  await act(async () => {
    tile.props.onPress?.(); // no-op even if invoked
  });
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});

// --- Today & needs attention section (Story 1.7) ----------------------------

it('shows only scheduled/in-progress jobs, sorted by scheduledStart ascending', async () => {
  const early = makeProfileJob({
    id: 'j-early',
    status: 'in_progress',
    scheduledStart: '2026-09-05T03:00:00.000Z',
    customer: { id: 'c-1', name: 'Early Customer', countryCode: '+91', phoneNumber: '1', address: null, city: null },
  });
  const late = makeProfileJob({
    id: 'j-late',
    status: 'scheduled',
    scheduledStart: '2026-09-05T09:00:00.000Z',
    customer: { id: 'c-2', name: 'Late Customer', countryCode: '+91', phoneNumber: '2', address: null, city: null },
  });
  const done = makeProfileJob({
    id: 'j-done',
    status: 'completed',
    customer: { id: 'c-3', name: 'Done Customer', countryCode: '+91', phoneNumber: '3', address: null, city: null },
  });
  const cancelled = makeProfileJob({
    id: 'j-cancelled',
    status: 'cancelled',
    customer: { id: 'c-4', name: 'Cancelled Customer', countryCode: '+91', phoneNumber: '4', address: null, city: null },
  });

  const renderer = await mountWithProfile({
    jobs: { data: [late, done, early, cancelled], nextCursor: null, hasMore: false },
  });

  const text = allText(renderer);
  expect(text).toContain('Early Customer');
  expect(text).toContain('Late Customer');
  expect(text).not.toContain('Done Customer');
  expect(text).not.toContain('Cancelled Customer');
  expect(text.indexOf('Early Customer')).toBeLessThan(text.indexOf('Late Customer'));
});

it('shows the overdue strip only when jobCounts.overdue > 0', async () => {
  const noOverdue = await mountWithProfile({ jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 } });
  expect(noOverdue.root.findAllByType(OverdueStrip).length).toBe(0);

  const withOverdue = await mountWithProfile({ jobCounts: { today: 0, upcoming: 0, overdue: 2, completed: 0, cancelled: 0 } });
  const strips = withOverdue.root.findAllByType(OverdueStrip);
  expect(strips.length).toBe(1);
  expect(strips[0].props.count).toBe(2);
});

it('renders the strip alone when there are no today jobs but overdue > 0 — the section never fully empties', async () => {
  const renderer = await mountWithProfile({
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 0, upcoming: 0, overdue: 3, completed: 0, cancelled: 0 },
  });

  expect(renderer.root.findAllByType(OverdueStrip).length).toBe(1);
  expect(allText(renderer)).not.toContain('Nothing scheduled today');
});

it('shows the empty state (with CTA) when there are no today jobs and overdue is 0', async () => {
  // Established dashboard requires `hasAnyJobCount` true (Story 1.5 gate);
  // history-only counts (completed/cancelled) keep it established while
  // today/overdue — the fields this section renders — stay empty.
  const renderer = await mountWithProfile({
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 3, cancelled: 1 },
    technicianCount: 2,
  });

  const text = allText(renderer);
  expect(text).toContain('Nothing scheduled today');
  expect(text).toContain("You're all clear. Overdue or upcoming work shows in the tiles above.");
  const cta = renderer.root.findAllByType(Button).find(b => b.props.children === 'Create a job');
  expect(cta).toBeDefined();
});

it('hides the "Create a job" CTA when the tenant has no technicians', async () => {
  // `technicianCount: 0` never reaches HomeScreen's established branch (the
  // first-run gate requires a technician) — rendered directly to pin the
  // component's own conditional (AC 7).
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(TodaysJobsSection, {
        jobs: [],
        overdueCount: 0,
        technicianCount: 0,
        technicians: [],
        onPressJob: jest.fn(),
        onPressStrip: jest.fn(),
        onPressCreate: jest.fn(),
      }),
    );
  });

  const cta = renderer.root.findAllByType(Button).find(b => b.props.children === 'Create a job');
  expect(cta).toBeUndefined();
});

it("resolves a job card's names from the embed, falling back when the embed's name is null", async () => {
  const embedded = makeProfileJob({ id: 'j-embed' });
  const anomaly = makeProfileJob({
    id: 'j-anomaly',
    customerId: 'c-9',
    technicianId: 'tech-9',
    scheduledStart: '2026-09-05T05:00:00.000Z',
    serviceType: 'electrical',
    customer: { id: 'c-9', name: null, countryCode: '', phoneNumber: '', address: null, city: null },
    technician: { id: 'tech-9', name: null, countryCode: '', phoneNumber: '', skills: [] },
  });

  const renderer = await mountWithProfile({
    jobs: { data: [embedded, anomaly], nextCursor: null, hasMore: false },
    technicians: [{ id: 'tech-9', name: 'Roster Fallback', countryCode: '+91', phoneNumber: '9', status: 'active', skills: [], skillIds: [], createdAt: '2026-01-01T00:00:00.000Z' }],
  });

  const text = allText(renderer);
  // Embedded row: names come straight from the embed.
  expect(text).toContain('Priya Sharma');
  expect(text).toContain('Ramesh');
  // Anomaly row: null customer name falls back to the service label,
  // null technician name falls back to the roster lookup.
  expect(text).toContain('Electrical');
  expect(text).toContain('Roster Fallback');
});

it("falls back for an empty-string embed name too, not just null", async () => {
  // A `||`, not `??`, chain: an empty string is falsy but not nullish, and
  // must still fall through to the next name source rather than render blank.
  const job = makeProfileJob({
    id: 'j-empty-name',
    serviceType: 'pest_control',
    customer: { id: 'c-1', name: '', countryCode: '', phoneNumber: '', address: null, city: null },
    technician: { id: 'tech-1', name: '', countryCode: '', phoneNumber: '', skills: [] },
  });

  const renderer = await mountWithProfile({
    jobs: { data: [job], nextCursor: null, hasMore: false },
    technicians: [{ id: 'tech-1', name: 'Roster Name', countryCode: '+91', phoneNumber: '9', status: 'active', skills: [], skillIds: [], createdAt: '2026-01-01T00:00:00.000Z' }],
  });

  const text = allText(renderer);
  expect(text).toContain('Pest control');
  expect(text).toContain('Roster Name');
});

it('does not crash and keeps a stable order when a job has a malformed scheduledStart', async () => {
  const malformed = makeProfileJob({ id: 'j-malformed', scheduledStart: 'not-a-date' });
  const valid = makeProfileJob({
    id: 'j-valid',
    scheduledStart: '2026-09-05T06:00:00.000Z',
    customerId: 'c-valid',
    customer: { id: 'c-valid', name: 'Valid Customer', countryCode: '+91', phoneNumber: '1', address: null, city: null },
  });

  const renderer = await mountWithProfile({
    jobs: { data: [malformed, valid], nextCursor: null, hasMore: false },
  });

  const text = allText(renderer);
  expect(text).toContain('Valid Customer');
  expect(text).toContain('Priya Sharma'); // the malformed row's own (default) customer name
});

it('pressing a today job card navigates to Owner Job Detail', async () => {
  const job = makeProfileJob({ id: 'j-press' });
  const renderer = await mountWithProfile({ jobs: { data: [job], nextCursor: null, hasMore: false } });

  const card = renderer.root.findAllByType(JobCard).find(c => c.props.job.id === 'j-press');
  await act(async () => {
    card?.props.onPress?.(job);
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'j-press' });
});

it('pressing the overdue strip navigates to the Jobs tab pre-set to the overdue scope', async () => {
  const renderer = await mountWithProfile({
    jobCounts: { today: 0, upcoming: 0, overdue: 1, completed: 0, cancelled: 0 },
  });

  const strip = renderer.root.findByType(OverdueStrip);
  await act(async () => {
    strip.props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Jobs', { scope: 'overdue' });
});

it('pressing "Create a job" in the empty state navigates to NewJob', async () => {
  const renderer = await mountWithProfile({
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 3, cancelled: 1 },
    technicianCount: 2,
  });

  const cta = renderer.root.findAllByType(Button).find(b => b.props.children === 'Create a job');
  await act(async () => {
    cta?.props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('NewJob');
});

// --- Bell (Story 3.4) -----------------------------------------------------------

/** The header bell, found by the start of its accessibility label. */
function bellFor(renderer: ReactTestRenderer): ReactTestInstance {
  const match = renderer.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(p => typeof p.props.accessibilityLabel === 'string' &&
      (p.props.accessibilityLabel as string).startsWith('Notifications'));
  if (!match) throw new Error('bell not rendered');
  return match;
}

it('the bell navigates to the Notifications screen on press', async () => {
  const renderer = await mountWithProfile();

  await act(async () => {
    bellFor(renderer).props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Notifications');
});

it("the bell's accessibility label carries the unread count (the dot is visual only)", async () => {
  mockUnreadCount = 3;
  const withCount = await mountWithProfile();
  expect(bellFor(withCount).props.accessibilityLabel).toBe('Notifications, 3 unread');

  mockUnreadCount = null; // no count yet — plain label, never "0 unread"
  const withoutCount = await mountWithProfile();
  expect(bellFor(withoutCount).props.accessibilityLabel).toBe('Notifications');
});

it('pull-to-refresh force-refreshes the unread count alongside the profile', async () => {
  const renderer = await mountWithProfile();
  mockLoadUnreadCount.mockClear();

  await act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });
  expect(mockLoadUnreadCount).toHaveBeenCalledWith({ force: true });
});
