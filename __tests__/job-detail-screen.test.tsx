/**
 * JobDetailScreen's fetch/state branches (AC 1, 5, 6): fetch on mount with
 * the route's jobId, a centered spinner (never a flash of empty content),
 * the not-available view on 404 (and 403), the actions slot testID, and the
 * section layout on a successful load.
 *
 * Navigation hooks are stubbed (the route/navigate shape is static), and the
 * services layer is mocked at the module boundary — the screen's logic under
 * test is its state machine, not the client.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    canGoBack: jest.fn(() => true),
    navigate: mockNavigate,
  }),
  useRoute: () => ({ params: { jobId: 'j-1' } }),
}));

jest.mock('../src/services', () => ({
  jobService: { getById: jest.fn() },
}));

import JobDetailScreen from '../src/features/jobDetail/JobDetailScreen';
import { Button, InlineError } from '../src/components/ui';
import { jobService } from '../src/services';
import type { ApiError, JobDetail } from '../src/services';

const getById = jobService.getById as jest.Mock;

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'j-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 't1',
    serviceLocation: '12 Anna Nagar, Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'in_progress',
    currentStep: 'in_progress',
    priority: 'urgent',
    requireCompletionPhoto: false,
    description: 'Leaking tap in the kitchen',
    notesForTechnician: 'Ring the bell twice',
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:30:00Z',
    technician: {
      id: 't1',
      name: 'Anil Kumar',
      countryCode: '+91',
      phoneNumber: '9000000001',
      skills: ['Plumbing', 'AC repair'],
    },
    customer: {
      id: 'c1',
      name: 'Ravi Kumar',
      countryCode: '+91',
      phoneNumber: '9000000002',
      address: '12 Anna Nagar',
      city: 'Chennai',
    },
    activityLog: [
      {
        id: 'l1',
        eventType: 'job_created',
        actorId: 'u1',
        metadata: null,
        createdAt: '2026-09-03T09:00:00Z',
      },
      {
        id: 'l2',
        eventType: 'step_on_my_way',
        actorId: 't1',
        metadata: null,
        createdAt: '2026-09-03T09:30:00Z',
      },
      {
        id: 'l3',
        eventType: 'brand_new_event',
        actorId: 't1',
        metadata: null,
        createdAt: '2026-09-03T09:40:00Z',
      },
    ],
    attachments: [
      {
        id: 'a1',
        type: 'photo',
        url: 'https://r2.example/p1.jpg',
        createdAt: '2026-09-03T09:50:00Z',
      },
      {
        id: 'a2',
        type: 'photo',
        url: null,
        createdAt: '2026-09-03T09:51:00Z',
      },
      {
        id: 'a3',
        type: 'signature',
        url: 'https://r2.example/sig.png',
        createdAt: '2026-09-03T09:52:00Z',
      },
    ],
    ...overrides,
  };
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

async function mountScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
  });
  return renderer;
}

afterEach(() => {
  jest.clearAllMocks();
});

it('fetches on mount with the route param and renders the full detail', async () => {
  getById.mockResolvedValue(makeDetail());
  const renderer = await mountScreen();

  expect(getById).toHaveBeenCalledWith('j-1', expect.anything());

  const text = renderedText(renderer);
  expect(text).toContain('JB-2026-0042'); // back-header title
  expect(text).toContain('Urgent');
  expect(text).toContain('In Progress');
  expect(text).toContain('Plumbing'); // serviceTypeLabel
  expect(text).toContain('Step 3 of 6 — In progress'); // current step line
  expect(text).toContain('Leaking tap in the kitchen'); // description
  expect(text).toContain('Notes for technician');
  expect(text).toContain('Ring the bell twice'); // notes body
  expect(text).toContain('Customer');
  expect(text).toContain('Ravi Kumar');
  expect(text).toContain('Technician');
  expect(text).toContain('Anil Kumar');
  expect(text).toContain('Plumbing, AC repair'); // skills joined
  expect(text).toContain('Photos & signature');
  expect(text).toContain('Customer signature');
  expect(text).toContain('Activity');
  expect(text).toContain('Job created'); // oldest event first
  expect(text).toContain('On my way');
  expect(text).toContain('brand_new_event'); // unknown type passes through raw
});

it('shows a centered spinner while loading, never a flash of empty content', async () => {
  let release!: (value?: unknown) => void;
  getById.mockImplementationOnce(
    () => new Promise(res => (release = () => res(makeDetail()))),
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
    });

    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(ScrollView).length).toBe(0);
    expect(renderedText(renderer)).not.toContain('Customer');
  } finally {
    await ReactTestRenderer.act(async () => {
      release();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  }
});

it('renders the not-available view on a 404', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Not found'), {
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain("This job isn't available");
  expect(text).toContain('It may have been removed or reassigned.');
  expect(renderer.root.findAllByType(ScrollView).length).toBe(0);

  // "Go back" pops the screen.
  const goBackButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Go back');
  expect(goBackButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    goBackButton!.props.onPress();
  });
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('renders the not-available view on a 403 too', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Forbidden'), {
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain("This job isn't available");
});

it('renders an inline error + Retry on a non-404 failure', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Server down'), {
      status: 500,
      code: 'SERVER_ERROR',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain('Server down');
  expect(
    renderer.root.findAllByType(Button).some(b => b.props.children === 'Retry'),
  ).toBe(true);
});

it('pull-to-refresh refetches the detail', async () => {
  getById.mockResolvedValue(makeDetail());
  const renderer = await mountScreen();
  expect(getById).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(RefreshControl).props.onRefresh();
  });

  expect(getById).toHaveBeenCalledTimes(2);
  // The refetch carries an abort signal now too (cancelled on unmount) and no
  // spinner swap — content stays on screen under the RefreshControl spinner.
  expect(getById).toHaveBeenLastCalledWith('j-1', expect.anything());
  expect(renderer.root.findAllByType(ScrollView).length).toBe(1);
});

it('keeps the loaded content when a refresh fails', async () => {
  getById.mockResolvedValueOnce(makeDetail());
  const renderer = await mountScreen();

  getById.mockRejectedValueOnce(
    Object.assign(new Error('Offline'), { status: 0, code: 'NETWORK_ERROR' }),
  );
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(RefreshControl).props.onRefresh();
  });

  // Spec §3: existing content stays on screen under the RefreshControl
  // spinner — a failed refresh must not swap it for the error view.
  expect(renderer.root.findAllByType(ScrollView).length).toBe(1);
  expect(renderedText(renderer)).toContain('Ravi Kumar');
  expect(renderer.root.findAllByType(InlineError).length).toBe(0);
  expect(renderedText(renderer).some(t => t.includes('Offline'))).toBe(false);
});

it('renders no progress line for an unknown currentStep (no "Step 0" nonsense)', async () => {
  getById.mockResolvedValue(
    makeDetail({ currentStep: 'something_new' as JobDetail['currentStep'] }),
  );
  const renderer = await mountScreen();

  // renderText returns text nodes, so containment is checked per node.
  const text = renderedText(renderer);
  expect(text.some(t => t.includes('Step 0'))).toBe(false);
  expect(text.some(t => t.includes('undefined'))).toBe(false);
  // The unknown step renders nowhere — the whole line stays hidden.
  expect(text.some(t => t.includes('something_new'))).toBe(false);
});

it('ignores a raw fetch AbortError instead of rendering a failure', async () => {
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Aborted'), { name: 'AbortError', status: 0 }),
  );
  const renderer = await mountScreen();

  // The abort is the app's own doing — no error view, no not-found view.
  expect(renderer.root.findAllByType(InlineError).length).toBe(0);
  expect(renderedText(renderer).some(t => t.includes("This job isn't available"))).toBe(false);
  expect(renderedText(renderer).some(t => t.includes('Aborted'))).toBe(false);
});

it('aborts the in-flight request on unmount and sets no state after', async () => {
  let capturedSignal!: AbortSignal;
  let release!: (value?: unknown) => void;
  getById.mockImplementationOnce(
    (_id: string, signal: AbortSignal) =>
      new Promise(res => {
        capturedSignal = signal;
        release = () => res(makeDetail());
      }),
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
    });

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    // The unmount aborted the in-flight request.
    expect(capturedSignal.aborted).toBe(true);

    // Settling the request after unmount must not surface any React warning
    // (i.e. no setState-after-unmount slipped through).
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await ReactTestRenderer.act(async () => {
        release();
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  } finally {
    release();
  }
});