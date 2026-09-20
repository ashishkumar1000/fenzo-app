/**
 * TodaysJobsSection × urgency rail — the caller-side wiring, which the card
 * and model tests never touch: the section owns a `useNow()` clock and feeds
 * it to every JobCard, so deleting the `urgencyNow={now}` pass-through makes
 * these rails vanish. Pure renderer, so no store mocks are needed — the
 * clock comes from the hook, and jobs arrive relative to real `Date.now()`.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import type { ViewStyle } from 'react-native';
import { act, create } from 'react-test-renderer';
import { colors } from '../../../theme';
import type { ApiJob } from '../../jobs/types';
import type { ProfileJob } from '../../../services';
import { TodaysJobsSection } from './TodaysJobsSection';

function job(minutesUntilStart: number, overrides: Partial<ApiJob> = {}): ProfileJob {
  const now = Date.now();
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    technicianId: 'tech-1',
    serviceLocation: 'Home',
    skill: { id: 'skill-1', name: 'AC service' },
    scheduledStart: new Date(now + minutesUntilStart * 60_000).toISOString(),
    scheduledEnd: null,
    status: 'scheduled',
    completedAt: null,
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    technician: { id: 'tech-1', name: 'Ravi', countryCode: '+91', phoneNumber: '9000000000', skills: [] },
    customer: { id: 'cust-1', name: 'Sharma', countryCode: '+91', phoneNumber: '9000000001', address: null, city: null },
    ...overrides,
  };
}

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

function renderSection(props: { jobs: ProfileJob[] }) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <TodaysJobsSection
        jobs={props.jobs}
        overdueCount={0}
        technicianCount={1}
        technicians={[]}
        onPressJob={() => {}}
        onPressStrip={() => {}}
        onPressCreate={() => {}}
      />,
    );
  });
  mounted.push(renderer);
  return renderer;
}

// The section owns a useNow interval per mount — leaving renderers up would
// leak live timers past the suite (jest force-exits the worker for it).
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

describe('TodaysJobsSection urgency wiring', () => {
  it('rails a job starting in 10 minutes red, via the section-owned clock', () => {
    const renderer = renderSection({ jobs: [job(10)] });
    const rails = railStyles(renderer).filter(s => s.borderLeftWidth === 3);
    expect(rails).toHaveLength(1);
    expect(rails[0].borderLeftColor).toBe(colors.status.cancelled.solid);
  });

  it('rails a far-out job green without any prop plumbing from above', () => {
    const renderer = renderSection({ jobs: [job(3 * 60)] });
    expect(
      railStyles(renderer).some(s => s.borderLeftColor === colors.status.done.solid),
    ).toBe(true);
  });
});