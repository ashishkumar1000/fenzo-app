/**
 * JobCard urgency rail — presentation probe.
 *
 * The rail is the caller-driven affordance: with `urgencyNow` the card gets
 * a 3px left border in the level's status colour; without the prop (and for
 * settled jobs) the card keeps its neutral hairline. Theme tokens real.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { ViewStyle } from 'react-native';
import { JobCard } from './components/JobCard';
import { colors } from '../../theme';
import type { ApiJob } from './types';

const NOW = new Date('2026-09-20T10:00:00Z').getTime();

function job(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    technicianId: 'tech-1',
    serviceLocation: 'Home',
    skill: { id: 'skill-1', name: 'AC service' },
    scheduledStart: new Date(NOW + 10 * 60_000).toISOString(),
    scheduledEnd: null,
    status: 'scheduled',
    completedAt: null,
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

/** All styles across the rendered tree that carry a left border width. */
function railStyles(renderer: ReactTestRenderer.ReactTestRenderer): ViewStyle[] {
  const found: ViewStyle[] = [];
  renderer.root.findAll(node => {
    const style = (node.props as { style?: unknown }).style;
    const flat = Array.isArray(style) ? style : [style];
    for (const s of flat) {
      if (s && typeof s === 'object' && 'borderLeftWidth' in s) {
        found.push(s as ViewStyle);
      }
    }
    return false;
  });
  return found;
}

function render(props: { job: ApiJob; urgencyNow?: number }) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(JobCard, props));
  });
  return renderer;
}

describe('JobCard urgency rail', () => {
  it('draws a 3px rail in the level colour when the clock is passed', () => {
    const renderer = render({ job: job({}), urgencyNow: NOW }); // 10 min away → red
    const rails = railStyles(renderer).filter(s => s.borderLeftWidth === 3);
    expect(rails).toHaveLength(1);
    expect(rails[0].borderLeftColor).toBe(colors.status.cancelled.solid);
  });

  it('picks the calm colour for a start far away', () => {
    const renderer = render({
      job: job({ scheduledStart: new Date(NOW + 3 * 60 * 60_000).toISOString() }),
      urgencyNow: NOW,
    });
    expect(
      railStyles(renderer).some(s => s.borderLeftColor === colors.status.done.solid),
    ).toBe(true);
  });

  it('picks the near colour for a start inside 2 hours', () => {
    const renderer = render({
      job: job({ scheduledStart: new Date(NOW + 90 * 60_000).toISOString() }),
      urgencyNow: NOW,
    });
    expect(
      railStyles(renderer).some(s => s.borderLeftColor === colors.status.scheduled.solid),
    ).toBe(true);
  });

  it('renders no rail without a clock (opt-in per surface)', () => {
    const renderer = render({ job: job({}) });
    expect(railStyles(renderer)).toHaveLength(0);
  });

  it('renders no rail for a completed job however late it ran', () => {
    const renderer = render({
      job: job({ status: 'completed', completedAt: new Date(NOW).toISOString() }),
      urgencyNow: NOW,
    });
    expect(railStyles(renderer)).toHaveLength(0);
  });
});
