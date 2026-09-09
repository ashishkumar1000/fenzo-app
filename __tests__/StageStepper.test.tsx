/**
 * StageStepper's render contract — the ring-vs-done-check distinction the
 * notifications completion fix (2026-09) hinges on. The model layer pins
 * `isCompleted` data, but nothing else observes the rendered glyph: reverting
 * the `&& isCompleted` guard in `isFinalCurrent` would ship the bug green
 * without this test (all model/screen tests would still pass).
 *
 * Fixtures come through `groupNotificationsByJob`, the exact path the screen
 * takes, so the stages/isCompleted pair is realistic. The signature_captured
 * job has three done columns and the Completed stage CURRENT — which must
 * render the outlined ring (3 checks), while a genuinely completed job
 * renders the final green check (4 checks).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Check } from 'lucide-react-native';

import { StageStepper } from '../src/features/notifications/components/StageStepper';
import { groupNotificationsByJob } from '../src/features/notifications/notificationCardModel';
import { colors } from '../src/theme';
import type { ApiNotification } from '../src/services';

function makeNotification(id: string, step: string, createdAt: string): ApiNotification {
  return {
    id,
    jobId: 'job-1',
    eventType: step,
    payload: { job_number: 'JB-1', step, technician_name: 'Priya' },
    readAt: null,
    createdAt,
  };
}

function stepperProps(events: ApiNotification[]) {
  const card = groupNotificationsByJob(events)[0];
  return { stages: card.stages, isCompleted: card.isCompleted };
}

async function renderStepper(props: {
  stages: ReturnType<typeof stepperProps>['stages'];
  isCompleted: boolean;
  currentColor: string;
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StageStepper
        stages={props.stages}
        currentColor={props.currentColor}
        isCompleted={props.isCompleted}
      />,
    );
  });
  return renderer;
}

describe('StageStepper glyph states', () => {
  it('a signature_captured job keeps the ring on Completed — no final done-check', async () => {
    const props = stepperProps([
      makeNotification('n1', 'on_my_way', '2026-09-09T12:10:00Z'),
      makeNotification('n2', 'arrived', '2026-09-09T12:20:00Z'),
      makeNotification('n3', 'in_progress', '2026-09-09T12:30:00Z'),
      makeNotification('n4', 'signature_captured', '2026-09-09T12:40:00Z'),
    ]);
    expect(props.isCompleted).toBe(false);
    const renderer = await renderStepper({
      ...props,
      currentColor: colors.status.progress.fg,
    });
    // Three done columns (On my way / Arrived / In progress) — the current
    // Completed column is mid-completion-flow and renders the ring, which
    // carries no Check glyph.
    expect(renderer.root.findAllByType(Check)).toHaveLength(3);
  });

  it('a genuinely completed job renders the final green done-check', async () => {
    const props = stepperProps([
      makeNotification('n1', 'on_my_way', '2026-09-09T12:10:00Z'),
      makeNotification('n2', 'arrived', '2026-09-09T12:20:00Z'),
      makeNotification('n3', 'in_progress', '2026-09-09T12:30:00Z'),
      makeNotification('n4', 'completed', '2026-09-09T12:40:00Z'),
    ]);
    expect(props.isCompleted).toBe(true);
    const renderer = await renderStepper({
      ...props,
      currentColor: colors.status.done.fg,
    });
    expect(renderer.root.findAllByType(Check)).toHaveLength(4);
  });
});