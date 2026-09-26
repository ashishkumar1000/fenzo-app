/**
 * ReportsScreen — the wiring the screen owns (stories 12-6 + 12-7), with the
 * `useReports` store stubbed to a mutable holder (the store's internals are
 * its own tests' job):
 *
 * - a ready row opens through a FRESH status fetch (`getReportStatus`) and
 *   hands the presigned URL to the system viewer; a non-ready or failed
 *   status surfaces as the `openError` banner, never a cached URL.
 * - `retryError` outranks `openError` in the banner, and the row being
 *   retried (by id) is the one whose Retry button spins.
 * - a Retry press routes through the store's `retryReportRequest` with the
 *   row id.
 * - a failed load with no data replaces the list with a full-screen error +
 *   Retry (the store's `refresh`), and focus refreshes through the
 *   throttled loader.
 *
 * The request form is stubbed (its pickers and validation are covered by
 * reportModel / the form's own concerns); ReportRow renders real, since the
 * tappable-card / Retry-button contracts are what this screen drives.
 */
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../../utils/linking', () => ({
  openUrl: jest.fn(),
}));

jest.mock('../technicians', () => ({
  useTechnicians: jest.fn(),
}));

jest.mock('../../services', () => ({
  reportService: {
    listReports: jest.fn(),
    createReport: jest.fn(),
    getReportStatus: jest.fn(),
    retryReport: jest.fn(),
  },
  TECHNICIAN_JOB_ACTIVITY_TYPE: 'technician_job_activity',
}));

jest.mock('./useReports', () => ({
  useReports: jest.fn(),
  createReportRequest: jest.fn(),
  loadReports: jest.fn(),
  retryReportRequest: jest.fn(),
}));

jest.mock('./components/ReportRequestForm', () => ({
  ReportRequestForm: () => null,
}));

import { useFocusEffect } from '@react-navigation/native';
import { Button, Card } from '../../components/ui';
import { openUrl } from '../../utils/linking';
import { reportService } from '../../services';
import type { ReportListItem } from '../../services';
import { useTechnicians } from '../technicians';
import {
  createReportRequest,
  loadReports,
  retryReportRequest,
  useReports,
} from './useReports';
import { ReportRow } from './components/ReportRow';
import ReportsScreen from './ReportsScreen';

const useReportsMock = useReports as jest.Mock;
const useTechniciansMock = useTechnicians as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;
const loadReportsMock = loadReports as jest.Mock;
const createReportRequestMock = createReportRequest as jest.Mock;
const retryReportRequestMock = retryReportRequest as jest.Mock;
const getReportStatus = reportService.getReportStatus as jest.Mock;
const openUrlMock = openUrl as jest.Mock;

const makeRow = (overrides: Partial<ReportListItem> = {}): ReportListItem => ({
  id: 'r-1',
  reportType: 'technician_job_activity',
  range: { startDate: '2026-09-01', endDate: '2026-09-07' },
  technicianCount: null,
  status: 'ready',
  errorCode: null,
  createdAt: '2026-09-08T06:05:00.000Z',
  completedAt: '2026-09-08T06:06:00.000Z',
  ...overrides,
});

// The store stub: a mutable holder the screen reads on every render. Each
// test overrides fields through this object (or spreads a replacement).
let store: ReturnType<typeof defaultStore>;

function defaultStore() {
  return {
    reports: [] as ReportListItem[],
    isLoading: false,
    error: null as string | null,
    hasLoaded: true,
    isSubmitting: false,
    submitError: null as string | null,
    retryingId: null as string | null,
    retryError: null as string | null,
    hasPending: false,
    refresh: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useTechniciansMock.mockReturnValue({ technicians: [] });
  loadReportsMock.mockResolvedValue(undefined);
  createReportRequestMock.mockResolvedValue(undefined);
  retryReportRequestMock.mockResolvedValue(undefined);
  store = defaultStore();
  useReportsMock.mockImplementation(() => store);
});

// Unmount so no focus effect or subscription outlives the suite.
const mounted: ReactTestRenderer[] = [];
let lastRenderer: ReactTestRenderer | null = null;
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  lastRenderer = null;
});

function renderScreen(): ReactTestInstance {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <ReportsScreen
        navigation={{ goBack: mockGoBack } as never}
        route={{} as never}
      />,
    );
  });
  mounted.push(renderer);
  lastRenderer = renderer;
  return renderer.root;
}

/** Joins nested Text children (arrays, elements) into one string. */
function flatten(children: unknown): string {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  const el = children as ReactTestInstance;
  return el.props ? flatten(el.props.children) : '';
}

/** The Card is tappable only when a row is ready. */
function tappableCard(root: ReactTestInstance) {
  return root.findAllByType(Card).find(c => typeof c.props.onPress === 'function');
}

function retryButton(root: ReactTestInstance) {
  return root
    .findAllByType(Button)
    .find(b => flatten(b.props.children) === 'Retry');
}

describe('history list', () => {
  it('renders one row per history item from the store', () => {
    store.reports = [
      makeRow({ id: 'r-1', status: 'ready' }),
      makeRow({ id: 'r-2', status: 'failed', errorCode: 'REPORT_GENERATION_FAILED' }),
    ];
    const root = renderScreen();

    expect(root.findAllByType(ReportRow)).toHaveLength(2);
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('History');
    expect(text).toContain('Report generation failed. Try again.');
  });

  it('opens a ready row through a fresh status fetch and the system viewer', async () => {
    store.reports = [makeRow({ id: 'r-1', status: 'ready' })];
    getReportStatus.mockResolvedValueOnce({
      id: 'r-1',
      status: 'ready',
      file: { url: 'https://files.fenzit.com/signed.pdf', sizeBytes: 1, filename: 'r.pdf' },
    });
    const root = renderScreen();

    const card = tappableCard(root);
    expect(card).toBeDefined();
    await act(async () => {
      card!.props.onPress();
    });

    expect(getReportStatus).toHaveBeenCalledWith('r-1');
    expect(openUrlMock).toHaveBeenCalledWith('https://files.fenzit.com/signed.pdf');
  });

  it('does not open the viewer while the report is not ready', async () => {
    store.reports = [makeRow({ id: 'r-1', status: 'ready' })];
    getReportStatus.mockResolvedValueOnce({ id: 'r-1', status: 'queued' });
    const root = renderScreen();

    await act(async () => {
      tappableCard(root)!.props.onPress();
    });

    expect(openUrlMock).not.toHaveBeenCalled();
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('This report is still generating. Try again shortly.');
  });

  it('shows a banner when the status fetch fails', async () => {
    store.reports = [makeRow({ id: 'r-1', status: 'ready' })];
    getReportStatus.mockRejectedValueOnce(new Error('down'));
    const root = renderScreen();

    await act(async () => {
      tappableCard(root)!.props.onPress();
    });

    expect(openUrlMock).not.toHaveBeenCalled();
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Could not open the report. Try again.');
  });
});

describe('retry banner and spinner', () => {
  it('shows retryError above the list, taking precedence over an open failure', async () => {
    store.reports = [
      makeRow({ id: 'r-1', status: 'ready' }),
      makeRow({ id: 'r-2', status: 'failed' }),
    ];
    getReportStatus.mockRejectedValueOnce(new Error('down'));
    const root = renderScreen();

    // First an open attempt fails → the openError banner shows.
    await act(async () => {
      tappableCard(root)!.props.onPress();
    });
    let text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Could not open the report. Try again.');

    // Then a retry fails: its banner outranks the stale open failure.
    store = { ...store, retryError: 'Only a failed report can be retried' };
    act(() => {
      lastRenderer!.update(
        <ReportsScreen
          navigation={{ goBack: mockGoBack } as never}
          route={{} as never}
        />,
      );
    });
    text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Only a failed report can be retried');
    expect(text).not.toContain('Could not open the report. Try again.');
  });

  it("spins only the retried row's Retry button while its retry is in flight", () => {
    store.reports = [
      makeRow({ id: 'r-1', status: 'ready' }),
      makeRow({ id: 'r-2', status: 'failed' }),
    ];
    store.retryingId = 'r-2';
    const root = renderScreen();

    expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(retryButton(root)?.props.loading).toBe(true);
  });

  it('retries through the store with the row id', () => {
    store.reports = [makeRow({ id: 'r-2', status: 'failed' })];
    const root = renderScreen();

    const button = retryButton(root);
    expect(button).toBeDefined();
    act(() => {
      button!.props.onPress();
    });

    expect(retryReportRequestMock).toHaveBeenCalledWith('r-2');
    expect(retryReportRequestMock).toHaveBeenCalledTimes(1);
  });
});

describe('failed load', () => {
  it('replaces the list with a full-screen error and Retry when the load failed with no data', () => {
    store.reports = [];
    store.error = 'Network request failed';
    store.hasLoaded = false;
    store.isLoading = false;
    const root = renderScreen();

    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Network request failed');
    // The history list (and its rows) is gone — the banner replaces it.
    expect(text).not.toContain('History');
    expect(root.findAllByType(ReportRow)).toHaveLength(0);

    const retry = root
      .findAllByType(Button)
      .find(b => flatten(b.props.children) === 'Retry');
    expect(retry).toBeDefined();
    act(() => {
      retry!.props.onPress();
    });
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('focus wiring', () => {
  it('refreshes the list on focus through the throttled loader', () => {
    renderScreen();
    const focusCallback = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
    act(() => {
      focusCallback();
    });
    expect(loadReportsMock).toHaveBeenCalled();
  });
});