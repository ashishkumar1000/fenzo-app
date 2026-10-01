/**
 * TodaysJobsSection × the leave-review strip (20-1). The strip's own
 * suite (`LeaveReviewStrip.test.tsx`) pins the strip's anatomy; this one
 * pins the CALLER-side wiring:
 *
 *  - the strip renders only when the count is a POSITIVE number AND a
 *    routing callback arrived (a null count fail-hides, the 19-5a rule);
 *  - "You're all clear" is suppressed while the strip shows — pending
 *    leave requests are something needing attention, and the empty card
 *    would lie under it;
 *  - the all-clear returns only when the strip leaves (the decision made
 *    or the count read 0 on refetch).
 */
import React from 'react';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import type { ProfileTechnician } from '../../../services';
import type { TodaysJobsSectionProps } from './TodaysJobsSection';
import { LeaveReviewStrip } from './LeaveReviewStrip';
import { TodaysJobsSection } from './TodaysJobsSection';

function baseProps(pendingLeaveRequests?: number): TodaysJobsSectionProps {
  const technician: ProfileTechnician = {
    id: 't1',
    name: 'Ravi',
    countryCode: '+91',
    phoneNumber: '9988776655',
    status: 'invited',
    skills: [],
    skillIds: [],
    createdAt: '2026-09-28T06:00:00.000Z',
  };
  return {
    jobs: [],
    overdueCount: 0,
    technicianCount: 1,
    technicians: [technician],
    pendingLeaveRequests,
    onPressLeaveStrip: jest.fn(),
    onPressJob: jest.fn(),
    onPressStrip: jest.fn(),
    onPressCreate: jest.fn(),
  };
}

const mountedRenderers: ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

function texts(rendered: ReactTestRenderer): string[] {
  return rendered.root
    .findAllByType(Text)
    .map((t: ReactTestInstance) =>
      Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? ''),
    );
}

describe('the leave strip wiring (20-1)', () => {
  it('count 3 + a routing callback: the strip renders; one tap files ONE route', () => {
    const props = baseProps(3);
    const onPressLeaveStrip = props.onPressLeaveStrip as jest.Mock;
    let rendered!: ReactTestRenderer;
    act(() => {
      rendered = create(<TodaysJobsSection {...props} />);
    });
    mountedRenderers.push(rendered);

    expect(rendered.root.findAllByType(LeaveReviewStrip)).toHaveLength(1);
    // The tap-through goes to the OWNER'S pending queue.
    const strip = rendered.root.findAllByType(LeaveReviewStrip)[0];
    act(() => {
      strip.props.onPress();
    });
    expect(onPressLeaveStrip).toHaveBeenCalledTimes(1);
  });

  it('count 0 hides the strip; a MISSING count fail-hides too', () => {
    for (const count of [0, undefined]) {
      const props = baseProps(count);
      let rendered!: ReactTestRenderer;
      act(() => {
        rendered = create(<TodaysJobsSection {...props} />);
      });
      mountedRenderers.push(rendered);
      expect(rendered.root.findAllByType(LeaveReviewStrip)).toHaveLength(0);
      const r = rendered;
      mountedRenderers.splice(mountedRenderers.indexOf(r), 1);
      act(() => r.unmount());
    }
  });

  it('"You\'re all clear" is suppressed while the strip shows', () => {
    const props = baseProps(2);
    let rendered!: ReactTestRenderer;
    act(() => {
      rendered = create(<TodaysJobsSection {...props} />);
    });
    mountedRenderers.push(rendered);

    const joined = texts(rendered).join('\n');
    expect(joined).not.toContain("You're all clear");
    expect(joined).toContain('Leave requests to review');
  });

  it('the all-clear RETURNS when the strip leaves (no pending requests, nothing else needs attention)', () => {
    const props = baseProps(0);
    let rendered!: ReactTestRenderer;
    act(() => {
      rendered = create(<TodaysJobsSection {...props} />);
    });
    mountedRenderers.push(rendered);

    const joined = texts(rendered).join('\n');
    expect(joined).toContain("You're all clear");
    expect(joined).not.toContain('Leave requests to review');
  });
});