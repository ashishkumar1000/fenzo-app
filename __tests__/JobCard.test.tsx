/**
 * JobCard's call sites of the formatter layer — the pure formatters have
 * their own unit tests, but nothing verified the card passes the right
 * fields to them (arg order, name fallbacks, badge/label mapping).
 * Rendered with react-test-renderer; output asserted via the rendered text.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { JobCard } from '../src/features/jobs/components/JobCard';
import type { ApiJob } from '../src/services';

function makeJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: 'j1',
    jobNumber: 'JB-2026-0001',
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 'tech-1',
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'completed',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
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

function renderCard(job: ApiJob, customerName?: string, technicianName?: string) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      React.createElement(JobCard, { job, customerName, technicianName }),
    );
  });
  return renderedText(renderer);
}

describe('JobCard', () => {
  it('renders the resolved customer name and status label', () => {
    const text = renderCard(makeJob(), 'Ravi Kumar', 'Anil');
    expect(text).toContain('Ravi Kumar');
    expect(text).toContain('Done'); // completed → done badge label
  });

  it('falls back to the service type label when no customer name resolves', () => {
    const text = renderCard(makeJob());
    expect(text).toContain('Plumbing');
    expect(text).not.toContain('Ravi Kumar');
  });

  it('marks an urgent job with an extra badge', () => {
    const text = renderCard(makeJob({ priority: 'urgent' }), 'Ravi');
    expect(text).toContain('Urgent');
  });

  it('does not mark a normal job as urgent', () => {
    const text = renderCard(makeJob({ priority: 'normal' }), 'Ravi');
    expect(text).not.toContain('Urgent');
  });

  it('renders the scheduled time from scheduledStart', () => {
    // A swapped start/end argument would render the epoch (12:00 AM) here,
    // since scheduledEnd is null — this is the call site the unit test
    // for formatTimeLabel cannot see.
    const text = renderCard(makeJob({ scheduledStart: '2026-09-03T10:00:00Z' }));
    expect(text.some(t => /\d{1,2}:\d{2}/.test(t))).toBe(true);
    expect(text.some(t => t.includes('12:00'))).toBe(false);
  });

  it('uses the description when present, else the service label, in the meta row', () => {
    const withDescription = renderCard(makeJob({ description: 'Leaking tap' }));
    expect(withDescription).toContain('Leaking tap');

    const without = renderCard(makeJob({ description: null }));
    expect(without).toContain('Plumbing');
  });

  it('shows no amount anywhere', () => {
    const text = renderCard(makeJob());
    expect(text.some(t => /₹|Rs\.?\s*\d/.test(t))).toBe(false);
  });
});