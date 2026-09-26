/**
 * ReportNotificationCard — one report notification's card (Epic 12). What
 * the CARD decides (the model behind it has its own coverage through the
 * screen tests): the ready vs failed copy paths, the status banner label,
 * the unread dot's a11y announcement, and the onPress wiring — the card
 * body AND the "View report" button both hand back the exact card object
 * (navigation itself is the screen's contract, tested there).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { Button } from '../../../components/ui';
import { relativeTime } from '../../../utils';
import type { ApiNotification } from '../../../services';
import { failedReportCopy } from '../../reports/reportModel';
import { buildReportCards } from '../reportNotificationModel';
import type { ReportNotificationCardData } from '../reportNotificationModel';
import { ReportNotificationCard } from './ReportNotificationCard';

/** The worker's payload shape — job_id NULL, report fields only. */
function makeReportNotification(
  id: string,
  overrides: Partial<ApiNotification> = {},
): ApiNotification {
  return {
    id,
    jobId: null,
    eventType: 'report_ready',
    entityType: null,
    entityId: null,
    payload: {
      reportId: `report-${id}`,
      reportType: 'technician_job_activity',
      reportLabel: 'Technician Job Report',
      status: 'ready',
      errorCode: null,
    },
    readAt: null,
    createdAt: '2026-09-20T05:00:00Z', // today on the IST test clock → "Just now"
    ...overrides,
  };
}

function makeCard(n: ApiNotification): ReportNotificationCardData {
  return buildReportCards([n], 'owner')[0];
}

function mountCard(card: ReportNotificationCardData) {
  const onPress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      React.createElement(ReportNotificationCard, { card, onPress }),
    );
  });
  return { renderer, onPress };
}

function renderedTexts(renderer: ReactTestRenderer.ReactTestRenderer): unknown[] {
  return renderer.root.findAllByType(Text).map(t => t.props.children);
}

it('a ready card shows its title, "Ready" banner, message and View report — never "View Job"', () => {
  const card = makeCard(
    makeReportNotification('r1', { readAt: '2026-09-20T05:01:00Z' }),
  );
  const { renderer } = mountCard(card);

  const texts = renderedTexts(renderer);
  expect(texts).toContain('Report ready');
  expect(texts).toContain('Ready');
  expect(texts).toContain('Technician Job Report is ready to view.');

  const viewReport = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'View report');
  expect(viewReport).toBeDefined();

  // A report card is NOT a job card — the job card's footer copy would be a
  // dead end (there is no job to deep-link to).
  expect(
    renderer.root.findAllByType(Button).find(b => b.props.children === 'View Job'),
  ).toBeUndefined();
  expect(texts).not.toContain('View Job');
});

it('a read card carries no unread announcement', () => {
  const card = makeCard(
    makeReportNotification('r1', { readAt: '2026-09-20T05:01:00Z' }),
  );
  const { renderer } = mountCard(card);

  const label = renderer.root.findByProps({ accessibilityRole: 'button' })
    .props.accessibilityLabel as string;
  expect(label.startsWith('Unread')).toBe(false);
});

it('a failed card shows "Report failed", the "Failed" banner and the friendly errorCode copy', () => {
  const card = makeCard(
    makeReportNotification('r2', {
      eventType: 'report_failed',
      entityType: null,
      entityId: null,
      payload: {
        reportId: 'report-r2',
        reportType: 'technician_job_activity',
        reportLabel: 'Technician Job Report',
        status: 'failed',
        errorCode: 'REPORT_RANGE_TOO_LARGE',
      },
    }),
  );
  const { renderer } = mountCard(card);

  const texts = renderedTexts(renderer);
  expect(texts).toContain('Report failed');
  expect(texts).toContain('Failed');
  // The message comes from the reports model's errorCode ladder — the same
  // copy the Reports screen shows, not a raw error code.
  expect(texts).toContain(failedReportCopy('REPORT_RANGE_TOO_LARGE'));
});

it('an unread card announces "Unread. " with the title, status label and relative time', () => {
  const card = makeCard(makeReportNotification('r3'));
  const { renderer } = mountCard(card);

  const label = renderer.root.findByProps({ accessibilityRole: 'button' })
    .props.accessibilityLabel as string;
  expect(label.startsWith('Unread. ')).toBe(true);
  expect(label).toContain(card.title); // "Report ready"
  expect(label).toContain(card.statusLabel); // "Ready"
  expect(label).toContain(relativeTime(card.latestCreatedAt));
});

it('pressing the "View report" button hands back the exact card object', () => {
  const card = makeCard(makeReportNotification('r4'));
  const { renderer, onPress } = mountCard(card);

  const viewReport = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'View report');
  expect(viewReport).toBeDefined();
  act(() => {
    viewReport?.props.onPress();
  });

  expect(onPress).toHaveBeenCalledTimes(1);
  // The exact object (not a clone) — the screen dispatches on `card.kind`
  // and reads unreadIds/report fields straight off it.
  expect(onPress.mock.calls[0][0]).toBe(card);
});

it('pressing the card body hands back the exact card object too', () => {
  const card = makeCard(makeReportNotification('r5'));
  const { renderer, onPress } = mountCard(card);

  const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });
  act(() => {
    pressable.props.onPress();
  });

  expect(onPress).toHaveBeenCalledTimes(1);
  expect(onPress.mock.calls[0][0]).toBe(card);
});