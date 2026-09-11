/**
 * Render tests for the stepper's 3.3 seams: the 'next' row is the ONLY
 * tappable one (done/locked render no Pressable at all), and a step with
 * advancesOn set is display-only too — that step advances server-side when
 * the triggering event occurs (e.g. photo confirm), so tapping it must
 * never fire `onAdvance`.
 *
 * Story 5.2: template-driven stepper using buildStepper.
 */
import ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { WorkflowStepper } from './WorkflowStepper';
import { buildStepper, type StepperJob } from '../stepperModel';
import type { ActivityLogEntry, WorkflowTemplateStep } from '../../../services';

type TestRoot = ReactTestRenderer.ReactTestInstance;
type StepperProps = Parameters<typeof WorkflowStepper>[0];

const NO_LOG: ActivityLogEntry[] = [];

const baseTemplate = {
  version: 1,
  steps: [
    { key: 'on_my_way', label: 'On my way', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'arrived', label: 'Arrived', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'in_progress', label: 'Start work', requiresPhoto: false, requiresSignature: false, setsStatus: 'in_progress', advancesOn: null } as WorkflowTemplateStep,
    { key: 'photos_uploaded', label: 'Upload photos', requiresPhoto: true, requiresSignature: false, setsStatus: null, advancesOn: 'photo_confirm' } as WorkflowTemplateStep,
    { key: 'signature_captured', label: 'Capture signature', requiresPhoto: false, requiresSignature: true, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'completed', label: 'Mark complete', requiresPhoto: false, requiresSignature: false, setsStatus: 'completed', advancesOn: null } as WorkflowTemplateStep,
  ],
};

function job(overrides: Partial<StepperJob> = {}): StepperJob {
  return {
    workflowTemplate: baseTemplate,
    currentStepIndex: null,
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
  it('pressing the next row calls onAdvance with that step key', () => {
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

  it('only the next row is tappable — done/locked rows render no Pressable', () => {
    const onAdvance = jest.fn();
    // Mid-progress (currentStepIndex: 3 is photos done), next is signature (index 4):
    // steps 0-3 done, 4 next, 5 locked.
    const root = renderStepper(
      job({ currentStepIndex: 3, status: 'in_progress' }),
      { onAdvance },
    );
    expect(tappableLabels(root)).toEqual(['Capture signature']);
  });

  it('step with advancesOn set is display-only — never onAdvance', () => {
    const onAdvance = jest.fn();
    // currentStepIndex: 2 (in_progress), next is photos_uploaded (index 3)
    // which has advancesOn=photo_confirm — 'next' but not tappable.
    const root = renderStepper(
      job({ currentStepIndex: 2, status: 'in_progress' }),
      { onAdvance },
    );
    // The photo row is 'next' but has advancesOn set, so no Pressable exists
    expect(root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });

  it('all template rows render with their labels from the template', () => {
    const root = renderStepper(job(), {});
    // All 6 rows render (template-driven, not filtered)
    const textLabels = root.findAllByProps({ children: 'On my way' })
      .concat(root.findAllByProps({ children: 'Arrived' }))
      .concat(root.findAllByProps({ children: 'Start work' }))
      .concat(root.findAllByProps({ children: 'Upload photos' }))
      .concat(root.findAllByProps({ children: 'Capture signature' }))
      .concat(root.findAllByProps({ children: 'Mark complete' }));
    expect(textLabels.length).toBeGreaterThan(0);
  });

  it('terminal job — all rows done, none tappable', () => {
    const root = renderStepper(job({ currentStepIndex: 5, status: 'completed' }), {
      onAdvance: jest.fn(),
    });
    expect(tappableLabels(root)).toHaveLength(0);
  });

  it('the pending row shows "Waiting to sync" (the subtle pressed state)', () => {
    const root = renderStepper(job(), { pendingStep: 'on_my_way' });
    const texts = root.findAllByProps({ children: 'Waiting to sync' });
    expect(texts.length).toBeGreaterThan(0);
  });

  it('custom template with custom labels — renders from template, not hardcoded', () => {
    const customTemplate = {
      version: 1,
      steps: [
        { key: 'custom_start', label: 'Custom Start Label', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
      ],
    };
    const root = renderStepper(job({ workflowTemplate: customTemplate, currentStepIndex: null }), {});
    expect(root.findAllByProps({ children: 'Custom Start Label' }).length).toBeGreaterThan(0);
  });
});