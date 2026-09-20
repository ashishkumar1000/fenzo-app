/**
 * ReportRow — one history row's contract (stories 12-6 + 12-7): a ready row
 * is the only tappable one (the screen owns the open call), a queued or
 * generating row is inert, and a failed row explains itself in friendly copy
 * (`failedReportCopy`) with a Retry button that spins while its retry POST
 * is in flight. The Badge vocabulary is the design system's fixed words.
 */
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Button, Card } from '../../../components/ui';
import { ReportRow } from './ReportRow';
import type { ReportListItem } from '../../../services';

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

/** Renders the row with its required flags; returns the test tree. */
function renderRow(
  item: ReportListItem,
  props: { isRetrying?: boolean; onRetry?: (i: ReportListItem) => void } = {},
) {
  let onPressItem: ReportListItem | undefined;
  const onPress = (i: ReportListItem) => {
    onPressItem = i;
  };
  let renderer!: ReactTestRenderer;
  let root!: ReactTestInstance;
  act(() => {
    renderer = create(
      <ReportRow
        item={item}
        isOpening={false}
        isRetrying={props.isRetrying ?? false}
        onPress={onPress}
        onRetry={props.onRetry}
      />,
    );
  });
  // The mount commits when act flushes — .root is only valid after it.
  root = renderer.root;
  return { root, onPressItem: () => onPressItem };
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

/** The Card is tappable only when ReportRow hands it a real onPress. */
function tappableCard(root: ReactTestInstance) {
  return root.findAllByType(Card).find(c => typeof c.props.onPress === 'function');
}

/** The row's Retry affordance (its label stays while it spins). */
function retryButton(root: ReactTestInstance) {
  return root
    .findAllByType(Button)
    .find(b => flatten(b.props.children) === 'Retry');
}

describe('a ready row', () => {
  it('shows the Ready badge with its range, scope and requested line', () => {
    const { root } = renderRow(
      makeRow({ technicianCount: 3, createdAt: '2026-09-08T10:35:00.000Z' }),
    );
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Ready');
    expect(text).toContain('1 Sep – 7 Sep 2026');
    expect(text).toContain('3 technicians');
    expect(text).toContain('Requested 8 Sep, 4:05 PM');
  });

  it('fires onPress with the item when the card is tapped', () => {
    const item = makeRow();
    const { root, onPressItem } = renderRow(item);

    const card = tappableCard(root);
    expect(card).toBeDefined();

    act(() => {
      card!.props.onPress();
    });
    expect(onPressItem()).toBe(item);
  });
});

describe('an unsettled row', () => {
  it('a queued row is not tappable and shows the Queued badge', () => {
    const { root } = renderRow(makeRow({ status: 'queued' }));
    expect(tappableCard(root)).toBeUndefined();
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Queued');
  });

  it('a generating row is not tappable and shows the Generating badge', () => {
    const { root } = renderRow(makeRow({ status: 'generating' }));
    expect(tappableCard(root)).toBeUndefined();
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Generating');
  });
});

describe('a failed row', () => {
  it('is not tappable and maps the engine error code to friendly copy', () => {
    const { root } = renderRow(
      makeRow({ status: 'failed', errorCode: 'REPORT_RANGE_TOO_LARGE' }),
    );
    expect(tappableCard(root)).toBeUndefined();
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('Failed');
    expect(text).toContain('That date range is too long. Try 92 days or less.');
  });

  it('falls back to generic copy when the row has no error code', () => {
    const { root } = renderRow(makeRow({ status: 'failed', errorCode: null }));
    const text = root
      .findAllByType(Text)
      .map(t => flatten(t.props.children))
      .join('\n');
    expect(text).toContain('This report failed. Try requesting it again.');
  });

  it('fires onRetry with the item when Retry is pressed', () => {
    const item = makeRow({ status: 'failed' });
    let retried: ReportListItem | undefined;
    const { root } = renderRow(item, {
      onRetry: i => {
        retried = i;
      },
    });

    const button = retryButton(root);
    expect(button).toBeDefined();
    act(() => {
      button!.props.onPress();
    });
    expect(retried).toBe(item);
  });

  it('spins and disables Retry while this row is retrying', () => {
    const { root } = renderRow(makeRow({ status: 'failed' }), {
      isRetrying: true,
    });

    expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);
    const button = retryButton(root);
    expect(button?.props.disabled).toBe(true);
    expect(button?.props.loading).toBe(true);
  });

  it('shows no spinner when the row is not retrying', () => {
    const { root } = renderRow(makeRow({ status: 'failed' }));
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(retryButton(root)?.props.disabled).toBe(false);
  });
});