/**
 * TechJobDetailScreen's state machine (ACs 1–5): fetch on mount with the
 * route's jobId, the §8 card layout, the 403 "no longer assigned" view (also
 * when a pull-to-refresh learns it), 404, the inline error + Retry, the
 * always-present signature card (placeholder when nothing was captured), the
 * history disclosure, and the ApiJob-only subset pushed into the shared
 * technician store (presigned URLs must never land there).
 *
 * Same seam-mock approach as the other screen tests: navigation hooks are
 * stubbed (the beforeRemove listener is captured so tests can simulate
 * leaving the screen), `jobService` is mocked at the module boundary, and the
 * real `useTechnicianJobs` store runs behind a probe component so the subset
 * write can be asserted.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn(() => true);
// Captured navigation listeners — a test simulates "the screen is leaving"
// by invoking the captured beforeRemove callback.
const navListeners: Record<string, () => void> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    canGoBack: mockCanGoBack,
    navigate: mockNavigate,
    addListener: (event: string, cb: () => void) => {
      navListeners[event] = cb;
      return jest.fn();
    },
  }),
  useRoute: () => ({ params: { jobId: 'j-1' } }),
}));

jest.mock('../src/services', () => ({
  jobService: { getById: jest.fn(), list: jest.fn(), advanceWorkflow: jest.fn() },
}));

// The screen mints a fresh idempotency key per advance; pin it so the
// advanceWorkflow call can be asserted verbatim.
jest.mock('../src/utils/idempotency', () => ({
  generateIdempotencyKey: () => 'key-fixed-0001',
}));

// formatPhone pulls the profile feature (a services consumer) — it's a
// formatting detail here, so stub it.
jest.mock('../src/features/profile', () => ({
  formatPhone: () => '+91 90000 00000',
}));

import TechJobDetailScreen from '../src/features/technicianApp/TechJobDetailScreen';
import { jobService } from '../src/services';
import {
  clearTechnicianJobs,
  loadToday,
  useTechnicianJobs,
} from '../src/features/technicianApp/useTechnicianJobs';
import { EmptyState } from '../src/components/ui';
import type { ApiJob, JobDetail, Paginated } from '../src/services';

const getById = jobService.getById as jest.Mock;
const list = jobService.list as jest.Mock;

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'j-1',
    jobNumber: 'JB-2026-0007',
    tenantId: 't1',
    customerId: 'c-1',
    technicianId: 'tech-1',
    serviceLocation: '12 Anna Nagar',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-04T10:00:00Z',
    scheduledEnd: '2026-09-04T11:00:00Z',
    status: 'scheduled',
    completedAt: null,
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: true,
    description: 'Leaking tap',
    notesForTechnician: 'Gate code 1234',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
    technician: {
      id: 'tech-1',
      name: 'Anil',
      countryCode: '+91',
      phoneNumber: '9000000001',
      skills: [],
    },
    customer: {
      id: 'c-1',
      name: 'Ravi Kumar',
      countryCode: '+91',
      phoneNumber: '9000000002',
      address: '12 Anna Nagar',
      city: 'Chennai',
    },
    activityLog: [],
    attachments: [],
    ...overrides,
  };
}

/** A bare list row — what the store is allowed to hold. */
const listRow: ApiJob = {
  id: 'j-1',
  jobNumber: 'JB-2026-0007',
  tenantId: 't1',
  customerId: 'c-1',
  technicianId: 'tech-1',
  serviceLocation: '12 Anna Nagar',
  serviceType: 'plumbing',
  scheduledStart: '2026-09-04T10:00:00Z',
  scheduledEnd: '2026-09-04T11:00:00Z',
  status: 'scheduled',
  completedAt: null,
  currentStep: null,
  priority: 'normal',
  requireCompletionPhoto: true,
  description: null,
  notesForTechnician: null,
  createdAt: '2026-09-01T09:00:00Z',
  updatedAt: '2026-09-01T09:00:00Z',
};

type Renderer = ReactTestRenderer.ReactTestRenderer;

/** Probe that mirrors the shared store so tests can assert what landed. */
let storeSnapshot: ReturnType<typeof useTechnicianJobs> | null = null;
function StoreProbe() {
  storeSnapshot = useTechnicianJobs();
  return null;
}

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

/** Walks up from a text node to the nearest ancestor with an onPress. */
function pressableAncestor(node: ReactTestRenderer.ReactTestInstance) {
  let current: ReactTestRenderer.ReactTestInstance | null = node;
  while (current) {
    if (typeof current.props.onPress === 'function') return current;
    current = current.parent;
  }
  return null;
}

// 3.3's WorkflowActionBar reads useSafeAreaInsets — every mount needs a provider.
const SAFE_METRICS = {
  insets: { top: 0, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

function withProvider(children: React.ReactElement): React.ReactElement {
  return <SafeAreaProvider initialMetrics={SAFE_METRICS}>{children}</SafeAreaProvider>;
}

async function mountScreen(): Promise<Renderer> {
  let renderer!: Renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <>
        {withProvider(<TechJobDetailScreen />)}
        <StoreProbe />
      </>,
    );
  });
  return renderer;
}

beforeEach(() => {
  clearTechnicianJobs();
});

afterEach(() => {
  jest.clearAllMocks();
});

it('spinner while the first load is in flight, then the §8 cards (AC 1)', async () => {
  let release!: () => void;
  getById.mockImplementationOnce(
    () =>
      new Promise<JobDetail>(res => {
        release = () => res(makeDetail());
      }),
  );
  try {
    let renderer!: Renderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(withProvider(<TechJobDetailScreen />));
    });
    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    await ReactTestRenderer.act(async () => {
      release();
    });

    const text = renderedText(renderer);
    expect(text).toContain('JB-2026-0007'); // header title
    expect(text).toContain('Progress');
    expect(text).toContain('0 of 6');
    expect(text).toContain('On my way'); // stepper's next row
    expect(text).toContain('Up next');
    expect(text).toContain('Customer');
    expect(text).toContain('Ravi Kumar');
    expect(text).toContain('Job details');
    expect(text).toContain('Leaking tap');
    expect(text).toContain('Notes from owner');
    expect(text).toContain('Gate code 1234');
    expect(text).toContain('Photos');
    expect(text).toContain('Customer signature');
    expect(text).toContain('History');
    expect(getById).toHaveBeenCalledWith('j-1', expect.anything());
  } finally {
    release();
  }
});

it('403 on the first load → the unassigned view (AC 5)', async () => {
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Forbidden'), { status: 403, code: 'JOB_NOT_ASSIGNED' }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain('This job is no longer assigned to you');
  expect(text).toContain('It may have been reassigned.');
  expect(text).toContain('Go back');
  expect(text).not.toContain('Progress');
});

it('403 on a pull-to-refresh → the unassigned view too (AC 5)', async () => {
  getById.mockResolvedValueOnce(makeDetail()).mockRejectedValueOnce(
    Object.assign(new Error('Forbidden'), { status: 403, code: 'JOB_NOT_ASSIGNED' }),
  );
  const renderer = await mountScreen();
  expect(renderedText(renderer)).toContain('Progress');

  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByType(ScrollView)
      .props.refreshControl.props.onRefresh();
  });

  const text = renderedText(renderer);
  expect(text).toContain('This job is no longer assigned to you');
  expect(text).not.toContain('Progress');
});

it('404 → the not-available view (AC 5)', async () => {
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Not found'), { status: 404, code: 'JOB_NOT_FOUND' }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain("This job isn't available");
  expect(text).not.toContain('This job is no longer assigned to you');
});

it('other failures → inline error + Retry that refetches (AC 5)', async () => {
  getById
    .mockRejectedValueOnce(Object.assign(new Error('Network offline')))
    .mockResolvedValueOnce(makeDetail());
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain('Network offline');
  expect(renderedText(renderer)).toContain('Retry');

  const retry = renderer.root.find(
    node => node.type === Text && node.props.children === 'Retry',
  );
  await ReactTestRenderer.act(async () => {
    pressableAncestor(retry)!.props.onPress();
  });
  expect(renderedText(renderer)).toContain('Progress');
  expect(getById).toHaveBeenCalledTimes(2);
});

it('a 403 leaving refetches Today with force (AC 5)', async () => {
  list.mockResolvedValue({ data: [], nextCursor: null, hasMore: false } satisfies Paginated<ApiJob>);
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Forbidden'), { status: 403, code: 'JOB_NOT_ASSIGNED' }),
  );
  await mountScreen();

  expect(list).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    navListeners.beforeRemove!();
  });
  expect(list).toHaveBeenCalledTimes(1);
});

it('the signature card always renders — placeholder for a captured-less terminal job', async () => {
  getById.mockResolvedValueOnce(
    makeDetail({ status: 'cancelled', currentStep: 'arrived' as JobDetail['currentStep'] }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain('Customer signature');
  expect(text).toContain('Captured at the signature step.');
  // Terminal + no photos → the photos card stays hidden (the stepper's
  // "Photos uploaded" label may still exist, so match the card title only).
  const photosCardTitle = renderer.root.findAll(
    node => node.type === Text && node.props.children === 'Photos',
  );
  expect(photosCardTitle).toHaveLength(0);
});

it('a captured signature renders the tile, not the placeholder', async () => {
  getById.mockResolvedValueOnce(
    makeDetail({
      attachments: [
        { id: 'sig-1', type: 'signature', url: 'https://r2/signature', createdAt: '2026-09-04T10:30:00Z' },
      ],
    }),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain('Customer signature');
  expect(text).not.toContain('Captured at the signature step.');
});

it('pushes only the ApiJob subset into the store — never the presigned URLs', async () => {
  list.mockResolvedValue({ data: [listRow], nextCursor: null, hasMore: false });
  await loadToday({ force: true });

  getById.mockResolvedValueOnce(makeDetail());
  await mountScreen();

  const row = storeSnapshot!.today.find(j => j.id === 'j-1');
  expect(row).toBeDefined();
  expect(row!.jobNumber).toBe('JB-2026-0007');
  // The detail-only fields (and their 1-hour presigned URLs) must not persist.
  expect('attachments' in row!).toBe(false);
  expect('activityLog' in row!).toBe(false);
  expect('technician' in row!).toBe(false);
  expect('customer' in row!).toBe(false);
});

it('the history disclosure expands into the timeline and collapses back', async () => {
  getById.mockResolvedValueOnce(
    makeDetail({
      activityLog: [
        {
          id: 'e-1',
          eventType: 'job_created',
          actorId: null,
          metadata: null,
          createdAt: '2026-09-01T09:00:00Z',
        },
      ],
    }),
  );
  const renderer = await mountScreen();

  expect(renderedText(renderer)).not.toContain('Job created'); // collapsed

  const historyHeader = renderer.root.find(
    node => node.type === Text && node.props.children === 'History',
  );
  await ReactTestRenderer.act(async () => {
    pressableAncestor(historyHeader)!.props.onPress();
  });
  expect(renderedText(renderer)).toContain('Job created'); // timeline entry

  await ReactTestRenderer.act(async () => {
    pressableAncestor(historyHeader)!.props.onPress();
  });
  expect(renderedText(renderer)).not.toContain('Job created');
});

/* ————— 3.3: workflow advance (ACs 2, 3, 4, 6) ————— */

const advanceWorkflow = jobService.advanceWorkflow as jest.Mock;

/** The bar's live Pressable (the duplicate-fiber entries lack onPress). */
function advanceButton(renderer: Renderer) {
  return renderer.root
    .findAllByProps({ testID: 'workflow-advance-button' })
    .filter((n: ReactTestRenderer.ReactTestInstance) => typeof n.props.onPress === 'function');
}

it('advancing posts the next step with a fresh idempotency key and merges the response (AC2)', async () => {
  // Seed the store so upsertTechnicianJob's replace-in-place has the row.
  list.mockResolvedValue({ data: [listRow], nextCursor: null, hasMore: false });
  await loadToday({ force: true });
  // Two getById calls: the mount, and the silent resync the advance chains
  // after success (server truth — activity log timestamps — arrives here).
  getById
    .mockResolvedValueOnce(makeDetail())
    .mockResolvedValueOnce(makeDetail({ status: 'in_progress', currentStep: 'on_my_way' }));
  advanceWorkflow.mockResolvedValueOnce({
    ...listRow,
    status: 'in_progress',
    currentStep: 'on_my_way',
    updatedAt: '2026-09-04T10:05:00Z',
  });
  const renderer = await mountScreen();
  expect(renderedText(renderer)).toContain('On my way'); // bar button

  await ReactTestRenderer.act(async () => {
    advanceButton(renderer)[0].props.onPress();
  });

  expect(advanceWorkflow).toHaveBeenCalledWith('j-1', 'on_my_way', 'key-fixed-0001');
  // Post-advance ApiJob merged in: the bar re-derives to the next step…
  expect(renderedText(renderer)).toContain('Arrived');
  // …and the shared store row is updated for the list badges.
  const row = storeSnapshot!.today.find(j => j.id === 'j-1');
  expect(row!.status).toBe('in_progress');
  expect(row!.currentStep).toBe('on_my_way');
});

it('422 step race reconciles silently — step patched locally and in the store, no error copy (AC5)', async () => {
  list.mockResolvedValue({ data: [listRow], nextCursor: null, hasMore: false });
  await loadToday({ force: true });
  // Mount, then the silent resync chained after the reconcile — the server
  // already knows the race's winner (currentStep 'arrived').
  getById
    .mockResolvedValueOnce(makeDetail())
    .mockResolvedValueOnce(makeDetail({ status: 'in_progress', currentStep: 'arrived' }));
  advanceWorkflow.mockRejectedValueOnce(
    Object.assign(new Error('Invalid workflow step transition'), {
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      details: { currentStep: 'arrived' },
    }),
  );
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    advanceButton(renderer)[0].props.onPress();
  });

  // Silent reconcile: the server's step is adopted, so the bar's next is
  // 'in_progress' ("Start work") — and NO inline error copy appears.
  expect(renderedText(renderer)).toContain('Start work');
  expect(renderedText(renderer)).not.toContain('This job can no longer be updated');
  expect(renderedText(renderer)).not.toContain('Invalid workflow step transition');
  const row = storeSnapshot!.today.find(j => j.id === 'j-1');
  expect(row!.currentStep).toBe('arrived');
});

it('409 locked — fixed copy (never the raw backend message) plus a full refetch (AC6)', async () => {
  getById.mockResolvedValue(makeDetail());
  advanceWorkflow.mockRejectedValueOnce(
    Object.assign(new Error('Job not modifiable'), { status: 409, code: 'JOB_NOT_MODIFIABLE' }),
  );
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    advanceButton(renderer)[0].props.onPress();
  });

  expect(renderedText(renderer)).toContain('This job can no longer be updated');
  expect(renderedText(renderer)).not.toContain('Job not modifiable');
  // The 409's full refetch is the second getById call.
  expect(getById).toHaveBeenCalledTimes(2);
});

it('offline advance — inline error, the button stays as the retry (AC6)', async () => {
  getById.mockResolvedValueOnce(makeDetail());
  advanceWorkflow.mockRejectedValueOnce(
    Object.assign(new Error('No connection'), { status: 0, code: 'NETWORK_ERROR' }),
  );
  const renderer = await mountScreen();

  await ReactTestRenderer.act(async () => {
    advanceButton(renderer)[0].props.onPress();
  });

  expect(renderedText(renderer)).toContain('No connection');
  expect(advanceButton(renderer).length).toBeGreaterThan(0); // retry affordance
});

it('completed job — the bar shows the static "Job completed" row, no button (AC2)', async () => {
  getById.mockResolvedValueOnce(
    makeDetail({ status: 'completed', currentStep: 'completed' as JobDetail['currentStep'] }),
  );
  const renderer = await mountScreen();

  expect(advanceButton(renderer)).toHaveLength(0);
  expect(renderedText(renderer)).toContain('Job completed');
});

it('cancelled job — no bar at all', async () => {
  getById.mockResolvedValueOnce(
    makeDetail({ status: 'cancelled', currentStep: 'arrived' as JobDetail['currentStep'] }),
  );
  const renderer = await mountScreen();

  expect(advanceButton(renderer)).toHaveLength(0);
  expect(renderedText(renderer)).not.toContain('Job completed');
});