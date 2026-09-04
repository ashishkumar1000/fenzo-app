/**
 * JobsScreen's conditional view logic — the store behind it has its own
 * tests, so this file covers what the *screen* decides: loading spinner vs
 * failed-with-no-data (non-dismissible banner + Retry) vs failed-with-data
 * (dismissible banner, rows kept) vs per-filter empty states, plus the
 * pagination / pull-to-refresh / "New job" wiring.
 *
 * The real `useJobs` store runs (with `jobService` mocked at the module
 * boundary, same as useJobs.test.ts); profile and customers are stubbed to
 * static data since they're just name sources here. `useFocusEffect` is
 * reduced to "run once mounted" — the screen only uses focus as a load
 * trigger, which the store's own tests already cover.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, FlatList, RefreshControl } from 'react-native';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  };
});
jest.mock('../src/services', () => ({
  jobService: { list: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/features/profile', () => ({
  useMyProfile: () => ({
    profile: { technicians: [{ id: 'tech-1', name: 'Anil' }] },
    isLoading: false,
    error: null,
  }),
}));
jest.mock('../src/features/customers', () => ({
  useCustomers: () => ({
    customers: [{ id: 'c1', name: 'Ravi Kumar' }],
    isLoading: false,
    error: null,
    hasLoaded: true,
  }),
}));

import JobsScreen from '../src/features/jobs/JobsScreen';
import { JobCard } from '../src/features/jobs/components/JobCard';
import { clearJobs, loadJobs } from '../src/features/jobs/useJobs';
import { Button, Card, InlineError, ScopeSelector } from '../src/components/ui';
import { StatusFilterBar } from '../src/features/jobs/components/StatusFilterBar';
import { jobService } from '../src/services';
import type { ApiJob, Paginated } from '../src/services';

const list = jobService.list as jest.Mock;

/** Mount the screen with a navigation stub; returns the renderer. */
const Screen = JobsScreen as unknown as React.FC<{
  navigation: { navigate: jest.Mock; setParams: jest.Mock };
  route: { params: undefined };
}>;
const navigation = { navigate: jest.fn(), setParams: jest.fn() };

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 'tech-1',
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    description: `Description ${id}`,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    updatedAt: '2026-09-03T09:00:00Z',
    ...overrides,
  };
}

function page(jobs: ApiJob[], nextCursor: string | null): Paginated<ApiJob> {
  return { data: jobs, nextCursor, hasMore: nextCursor !== null };
}

/** All rendered text strings, document order. */
function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestRendererJSON): void => {
    if (node.type === 'Text') {
      const direct = (node.children ?? []).filter(
        (c): c is string => typeof c === 'string',
      );
      if (direct.length) out.push(direct.join(''));
    }
    (node.children ?? []).forEach(child => {
      if (typeof child !== 'string') walk(child);
    });
  };
  const json = renderer.toJSON();
  const roots = Array.isArray(json) ? json : json ? [json] : [];
  roots.forEach(root => (typeof root === 'string' ? undefined : walk(root)));
  return out;
}

/** Direct string children of an element (JobCard-less Button labels). */
function labelOf(instance: ReactTestRenderer.ReactTestInstance): string {
  const c = instance.props.children;
  if (typeof c === 'string') return c;
  return Array.isArray(c)
    ? c.filter((x): x is string => typeof x === 'string').join('')
    : '';
}

function findButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const match = renderer.root
    .findAllByType(Button)
    .find(b => labelOf(b) === label);
  if (!match) throw new Error(`Button "${label}" not rendered`);
  return match;
}

/** Every mounted screen renderer, so subscribers are gone before the store resets. */
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function mountScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(Screen, { navigation, route: { params: undefined } }),
    );
  });
  mounted.push(renderer);
  return renderer;
}

/** Mount with one-shot route params (e.g. Home's tile deep link, AC #10). */
async function mountScreenWithParams(
  params: { scope: 'today' | 'upcoming' | 'overdue' | 'history' },
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(Screen, { navigation, route: { params } } as never),
    );
  });
  mounted.push(renderer);
  return renderer;
}

afterEach(async () => {
  // Unmount first: a live subscriber would re-render outside act when the
  // store resets in the next test's setup.
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(r => r.unmount());
  });
  clearJobs();
  jest.clearAllMocks();
});

it('shows the spinner while the first load is in flight, then rows', async () => {
  let release!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiJob>>(res => {
        release = () => res(page([makeJob('a')], null));
      }),
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    renderer = await mountScreen();

    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(FlatList).length).toBe(0);

    await ReactTestRenderer.act(async () => {
      release();
    });
    expect(renderer.root.findAllByType(FlatList).length).toBe(1);
    expect(renderedText(renderer)).toContain('Description a');
  } finally {
    release(); // never leave a hanging load poisoning the shared store
  }
});

it('resolves names from the customers and profile stores', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain('Ravi Kumar'); // customerId → name
  expect(renderedText(renderer)).toContain('Anil'); // technicianId → name
});

it('replaces the list with a non-dismissible banner + Retry when a load fails with no data', async () => {
  list.mockRejectedValueOnce(Object.assign(new Error('Network offline')));
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain('Network offline');
  expect(text).toContain('Retry');
  expect(text).not.toContain('No jobs yet');
  expect(renderer.root.findAllByType(FlatList).length).toBe(0);

  // Retry refetches.
  list.mockResolvedValue(page([makeJob('a')], null));
  await ReactTestRenderer.act(async () => {
    findButton(renderer, 'Retry').props.onPress();
  });
  expect(list).toHaveBeenCalledTimes(2);
  expect(renderer.root.findAllByType(FlatList).length).toBe(1);
});

it('keeps rows behind a dismissible banner when a refresh fails with data present', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null));
  const renderer = await mountScreen();

  list.mockRejectedValueOnce(Object.assign(new Error('Still offline')));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });

  expect(renderedText(renderer)).toContain('Still offline');
  expect(renderer.root.findAllByType(InlineError).length).toBe(1);
  expect(renderedText(renderer)).toContain('Ravi Kumar'); // rows stayed

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(InlineError).props.onDismiss();
  });
  expect(renderer.root.findAllByType(InlineError).length).toBe(0);
  expect(renderedText(renderer)).toContain('Ravi Kumar'); // rows kept after dismiss
});

it('shows the per-filter empty state copy', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    loadJobs('today', 'completed');
  });

  const text = renderedText(renderer);
  expect(text).toContain('No jobs yet');
  expect(text).toContain('Jobs a technician has marked complete will show up here.');
});

it('loads the next page when the list reaches its end', async () => {
  list.mockResolvedValueOnce(page([makeJob('a'), makeJob('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([makeJob('c')], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(FlatList).props.onEndReached();
  });

  expect(list).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', status: undefined, cursor: 'cursor-1' });
  expect(renderedText(renderer)).toContain('Description c'); // appended
});

it('navigates to NewJob from the header button', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    findButton(renderer, 'New job').props.onPress();
  });
  expect(navigation.navigate).toHaveBeenCalledWith('NewJob');
});

it('opens JobDetail with the pressed job\'s id when a card is pressed', async () => {
  list.mockResolvedValue(page([makeJob('job-abc')], null));
  const renderer = await mountScreen();

  // JobCard wraps `onPress(job)` in its Card; invoke the Card's handler.
  const card = renderer.root.findAllByType(JobCard)[0];
  await ReactTestRenderer.act(async () => {
    card.findAllByType(Card)[0].props.onPress();
  });
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'job-abc' });
});

// --- Scope switching (Story 1.5) ---------------------------------------------

it('consumes a one-shot scope param: loads that scope and clears the param (AC #10)', async () => {
  list.mockResolvedValue(page([], null));
  await mountScreenWithParams({ scope: 'overdue' });

  expect(list).toHaveBeenCalledWith({ scope: 'overdue' });
  expect(navigation.setParams).toHaveBeenCalledWith({ scope: undefined });
});

it('pressing a scope chip loads that scope and shows its empty state', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScopeSelector).props.onChange('upcoming');
  });

  expect(list).toHaveBeenLastCalledWith({ scope: 'upcoming' }); // chip reset → no status param
  const text = renderedText(renderer);
  expect(text).toContain('No upcoming jobs');
  expect(text).toContain('Jobs booked for tomorrow or later will show up here.');
  // Upcoming hides the chip row entirely — the server pre-narrows status there.
  expect(renderer.root.findAllByType(StatusFilterBar).length).toBe(0);
});

it('shows the overdue empty state on the overdue scope', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScopeSelector).props.onChange('overdue');
  });

  expect(list).toHaveBeenLastCalledWith({ scope: 'overdue' });
  const text = renderedText(renderer);
  expect(text).toContain('Nothing overdue');
  expect(text).toContain('Jobs past their date that were never finished will show up here.');
  expect(renderer.root.findAllByType(StatusFilterBar).length).toBe(0);
});

it('History narrows the chip row to its three chips', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScopeSelector).props.onChange('history');
  });

  expect(list).toHaveBeenLastCalledWith({ scope: 'history' }); // all kept → no status param
  const bar = renderer.root.findByType(StatusFilterBar);
  expect(bar.props.filters).toEqual(['all', 'completed', 'cancelled']);
  expect(bar.props.value).toBe('all');
});

it('keeps the Done chip across a Today → History switch, on screen and on the wire', async () => {
  list.mockResolvedValue(page([], null));
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(StatusFilterBar).props.onChange('completed');
  });
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', status: ['completed'] });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScopeSelector).props.onChange('history');
  });
  // filterForScope keeps a chip History can still show — both on the wire...
  expect(list).toHaveBeenLastCalledWith({ scope: 'history', status: ['completed'] });
  // ...and in the narrowed chip row.
  const bar = renderer.root.findByType(StatusFilterBar);
  expect(bar.props.filters).toEqual(['all', 'completed', 'cancelled']);
  expect(bar.props.value).toBe('completed');
  expect(renderedText(renderer)).toContain('No history yet');
});