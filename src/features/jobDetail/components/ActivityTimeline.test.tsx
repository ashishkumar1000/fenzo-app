/**
 * Wiring tests for ActivityTimeline's location caption (story 7.10): the
 * timeline must turn `activityLog[].metadata` into a distance caption (via
 * the customer's saved coordinates) and leave every non-location row — and
 * every row of a pre-Epic-7 job — rendering exactly as before. The
 * component is dumb by design: props in, UI out.
 */
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import type { ActivityLogEntry } from '../../../services';
import { ActivityTimeline } from './ActivityTimeline';

/** Collect every string a rendered Text carries, depth-first. */
function allTexts(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestInstance) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    for (const child of node.children) walk(child as ReactTestInstance);
  };
  for (const child of root.children) walk(child as ReactTestInstance);
  return out;
}

const ENTRY = (overrides: Partial<ActivityLogEntry>): ActivityLogEntry => ({
  id: 'log-1',
  eventType: 'step_photos_uploaded',
  actorId: 'u-1',
  metadata: null,
  createdAt: '2026-09-14T10:00:00Z',
  ...overrides,
});

/** Create inside act() — matching the repo's component-test precedent. */
function renderTimeline(props: {
  entries: ActivityLogEntry[];
  workflowTemplate: null;
  jobSite?: { latitude: number; longitude: number } | null;
}): ReactTestInstance {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ActivityTimeline {...props} />);
  });
  return renderer.root;
}

describe('ActivityTimeline location caption (7.10)', () => {
  it('shows the distance from the job site for a captured fix', () => {
    const root = renderTimeline({
      entries: [
        ENTRY({
          metadata: {
            latitude: 12.9716,
            longitude: 77.5946,
            accuracy: 18.4,
            locationCaptured: true,
          },
        }),
      ],
      workflowTemplate: null,
      jobSite: { latitude: 12.9726, longitude: 77.5946 },
    });
    const texts = allTexts(root);
    expect(texts.some(t => /(?:≈\s?)?11[0-9] m away/.test(t))).toBe(true);
  });

  it('appends the low-accuracy hint for flagged fixes', () => {
    const root = renderTimeline({
      entries: [
        ENTRY({
          metadata: {
            latitude: 12.9716,
            longitude: 77.5946,
            accuracy: 240,
            locationCaptured: true,
            accuracyFlagged: true,
          },
        }),
      ],
      workflowTemplate: null,
      jobSite: { latitude: 12.9726, longitude: 77.5946 },
    });
    expect(allTexts(root).some(t => /low GPS accuracy/.test(t))).toBe(true);
  });

  it('shows "Location captured" without a distance when the job site is unknown', () => {
    const root = renderTimeline({
      entries: [ENTRY({ metadata: { latitude: 12.9716, longitude: 77.5946 } })],
      workflowTemplate: null,
      jobSite: null,
    });
    expect(allTexts(root)).toContain('Location captured');
  });

  it('shows the stored reason for a missed capture', () => {
    const root = renderTimeline({
      entries: [
        ENTRY({
          metadata: { locationCaptured: false, reason: 'Location not provided' },
        }),
      ],
      workflowTemplate: null,
      jobSite: { latitude: 12.9726, longitude: 77.5946 },
    });
    expect(allTexts(root)).toContain('Location not captured — Location not provided');
  });

  it('renders no caption for pre-Epic-7 rows and non-location events', () => {
    const root = renderTimeline({
      entries: [
        ENTRY({ id: 'log-1', metadata: null }), // pre-Epic-7 step row
        ENTRY({ id: 'log-2', eventType: 'job_created', metadata: { technicianId: 'u-2' } }),
      ],
      workflowTemplate: null,
      jobSite: { latitude: 12.9726, longitude: 77.5946 },
    });
    const texts = allTexts(root);
    expect(texts.some(t => /away/.test(t))).toBe(false);
    expect(texts.some(t => t.startsWith('Location'))).toBe(false);
  });

  it('renders no caption when metadata is hostile garbage', () => {
    const root = renderTimeline({
      entries: [ENTRY({ metadata: 'garbage' as unknown as Record<string, unknown> })],
      workflowTemplate: null,
      jobSite: { latitude: 12.9726, longitude: 77.5946 },
    });
    expect(allTexts(root).some(t => t.startsWith('Location'))).toBe(false);
  });
});
