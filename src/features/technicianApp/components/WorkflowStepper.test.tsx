/**
 * Render tests for the stepper's 3.3 seams: the 'next' row is the ONLY
 * tappable one (done/locked/skipped render no Pressable at all), and a
 * `next` photos_uploaded row is display-only too — that step advances
 * server-side when a photo is confirmed (fenzit-be Story 3.6; the backend
 * would 422 a direct POST that skipped the upload), so tapping it must
 * never fire `onAdvance`.
 *
 * Steps are derived through the real `buildStepper` so these tests pin the
 * same contract the bar and screen rely on, not a hand-built fixture.
 */
import ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { WorkflowStepper } from './WorkflowStepper';
import { buildStepper, type StepperJob } from '../stepperModel';
import type { ActivityLogEntry } from '../../../services';

type TestRoot = ReactTestRenderer.ReactTestInstance;
type StepperProps = Parameters<typeof WorkflowStepper>[0];

const NO_LOG: ActivityLogEntry[] = [];

function job(overrides: Partial<StepperJob> = {}): StepperJob {
  return {
    currentStep: null,
    requireCompletionPhoto: false,
    status: 'scheduled',
    ...overrides,
  };
}

function renderStepper(stepperJob: StepperJob, props: Partial<StepperProps> = {}): TestRoot {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<WorkflowStepper steps={buildStepper(stepperJob, NO_LOG)} {...props} />);
  });
  return renderer.root;
}

/** Pressables that actually carry a handler (React 19 duplicate fibers don't).
 *  Rows are located by accessibilityRole, not by type — RN's jest mock makes
 *  findAllByType(Pressable) return nothing (same quirk as the bar tests). */
function livePressables(root: TestRoot) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter((p: ReactTestRenderer.ReactTestInstance) => typeof p.props.onPress === 'function');
}

/** Distinct accessibility labels of the tappable rows. */
function tappableLabels(root: TestRoot): string[] {
  return Array.from(
    new Set(livePressables(root).map((p: ReactTestRenderer.ReactTestInstance) => p.props.accessibilityLabel as string)),
  );
}

describe('WorkflowStepper', () => {
  it('pressing the next row calls onAdvance with that step', () => {
    const onAdvance = jest.fn();
    const root = renderStepper(job(), { onAdvance });
    const pressable = livePressables(root).find(
      (p: ReactTestRenderer.ReactTestInstance) => p.props.accessibilityLabel === 'On my way',
    );
    expect(pressable).toBeDefined();
    act(() => {
      pressable!.props.onPress();
    });
    expect(onAdvance).toHaveBeenCalledWith('on_my_way');
  });

  it('only the next row is tappable — done/locked/skipped rows render no Pressable', () => {
    const onAdvance = jest.fn();
    // Mid-progress, no photo required: three done rows, one skipped
    // (photos_uploaded), signature next, completed locked.
    const root = renderStepper(job({ currentStep: 'in_progress', status: 'in_progress' }), { onAdvance });
    expect(tappableLabels(root)).toEqual(['Signature captured']);
  });

  it('a next photos_uploaded row (photo required) is display-only — never onAdvance', () => {
    const onAdvance = jest.fn();
    // requireCompletionPhoto + in_progress is exactly the case where
    // buildStepper marks photos_uploaded 'next' — the bar's pill owns the
    // action; the rail row must not post it.
    const root = renderStepper(
      job({ currentStep: 'in_progress', status: 'in_progress', requireCompletionPhoto: true }),
      { onAdvance },
    );
    expect(root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('the pending row shows "Waiting to sync" (the subtle pressed state)', () => {
    const root = renderStepper(job(), { pendingStep: 'on_my_way' });
    const texts = root.findAllByProps({ children: 'Waiting to sync' });
    expect(texts.length).toBeGreaterThan(0);
  });
});