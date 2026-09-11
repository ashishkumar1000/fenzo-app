/**
 * Tests for the stepper model — template-driven step derivation (Story 5.2).
 * Pure logic: given a job with a stamped template and current state, the
 * stepper renders one row per template step with the correct state (done/next/locked)
 * and attributes (label, advancesOn, timestamp).
 */
import { buildStepper, type StepperJob } from './stepperModel';
import type { JobDetail, WorkflowTemplateStep } from '../../services';

const photoStep: WorkflowTemplateStep = {
  key: 'photos_uploaded',
  label: 'Upload photos',
  requiresPhoto: true,
  requiresSignature: false,
  setsStatus: null,
  advancesOn: 'photo_confirm',
};

const signatureStep: WorkflowTemplateStep = {
  key: 'signature_captured',
  label: 'Capture signature',
  requiresPhoto: false,
  requiresSignature: true,
  setsStatus: null,
  advancesOn: null,
};

const completedStep: WorkflowTemplateStep = {
  key: 'completed',
  label: 'Mark complete',
  requiresPhoto: false,
  requiresSignature: false,
  setsStatus: 'completed',
  advancesOn: null,
};

const template = {
  version: 1,
  steps: [
    { key: 'on_my_way', label: 'On my way', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
    { key: 'arrived', label: 'Arrived', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
    { key: 'in_progress', label: 'Start work', requiresPhoto: false, requiresSignature: false, setsStatus: 'in_progress', advancesOn: null },
    photoStep,
    signatureStep,
    completedStep,
  ],
};

function job(overrides: Partial<StepperJob> = {}): StepperJob {
  return {
    workflowTemplate: template,
    currentStepIndex: null,
    status: 'scheduled',
    ...overrides,
  };
}

function stepLog(stepKey: string, at = '2026-09-04T10:30:00.000Z') {
  return { eventType: `step_${stepKey}`, createdAt: at };
}

describe('buildStepper', () => {
  it('fresh job (currentStepIndex: null) — first step is next, rest locked', () => {
    const stepper = buildStepper(job(), []);
    expect(stepper).toEqual([
      expect.objectContaining({ step: 'on_my_way', state: 'next', label: 'On my way', advancesOn: null }),
      expect.objectContaining({ step: 'arrived', state: 'locked' }),
      expect.objectContaining({ step: 'in_progress', state: 'locked' }),
      expect.objectContaining({ step: 'photos_uploaded', state: 'locked' }),
      expect.objectContaining({ step: 'signature_captured', state: 'locked' }),
      expect.objectContaining({ step: 'completed', state: 'locked' }),
    ]);
  });

  it('mid-chain (currentStepIndex: 1) — steps 0-1 done, 2 next, rest locked', () => {
    const stepper = buildStepper(job({ currentStepIndex: 1, status: 'in_progress' }), [
      stepLog('on_my_way'),
      stepLog('arrived'),
    ]);
    expect(stepper.map(s => s.state)).toEqual(['done', 'done', 'next', 'locked', 'locked', 'locked']);
  });

  it('photo step (with advancesOn=photo_confirm) — label and advancesOn flow through', () => {
    const stepper = buildStepper(job({ currentStepIndex: 2, status: 'in_progress' }), []);
    const photoRow = stepper.find(s => s.step === 'photos_uploaded');
    expect(photoRow).toEqual(
      expect.objectContaining({
        state: 'next',
        label: 'Upload photos',
        advancesOn: 'photo_confirm',
      }),
    );
  });

  it('signature step (requiresSignature=true) — flows through', () => {
    const stepper = buildStepper(job({ currentStepIndex: 3, status: 'in_progress' }), []);
    const sigRow = stepper.find(s => s.step === 'signature_captured');
    expect(sigRow).toEqual(
      expect.objectContaining({
        state: 'next',
        label: 'Capture signature',
        advancesOn: null,
      }),
    );
  });

  it('terminal job (status=completed) — all steps done, none next', () => {
    const stepper = buildStepper(job({ currentStepIndex: 5, status: 'completed' }), []);
    expect(stepper.every(s => s.state === 'done')).toBe(true);
  });

  it('terminal cancelled — all steps done or locked, none next', () => {
    const stepper = buildStepper(job({ currentStepIndex: 2, status: 'cancelled' }), []);
    expect(stepper.some(s => s.state === 'next')).toBe(false);
  });

  it('timestamp captured from activity log — done steps get the step_X timestamp', () => {
    const logTime = '2026-09-04T10:15:30.000Z';
    const stepper = buildStepper(job({ currentStepIndex: 1 }), [
      stepLog('on_my_way', logTime),
      stepLog('arrived'),
    ]);
    const onMyWayRow = stepper.find(s => s.step === 'on_my_way');
    expect(onMyWayRow?.timestamp).toBe(logTime);
  });

  it('null template renders no rows gracefully', () => {
    const stepper = buildStepper(job({ workflowTemplate: null }), []);
    expect(stepper).toEqual([]);
  });

  it('missing template (undefined) renders no rows gracefully', () => {
    const stepper = buildStepper(job({ workflowTemplate: undefined }), []);
    expect(stepper).toEqual([]);
  });

  it('single-step template — one step cycles through all states', () => {
    const singleStep = {
      version: 1,
      steps: [completedStep],
    };
    // Fresh: next
    let stepper = buildStepper(job({ workflowTemplate: singleStep, currentStepIndex: null }), []);
    expect(stepper[0]?.state).toBe('next');

    // Done
    stepper = buildStepper(job({ workflowTemplate: singleStep, currentStepIndex: 0 }), []);
    expect(stepper[0]?.state).toBe('done');

    // Terminal
    stepper = buildStepper(job({ workflowTemplate: singleStep, currentStepIndex: 0, status: 'completed' }), []);
    expect(stepper[0]?.state).toBe('done');
  });

  it('beyond-template index — treats as beyond and marks everything done (graceful)', () => {
    const stepper = buildStepper(job({ currentStepIndex: 99, status: 'in_progress' }), []);
    // currentStepIndex 99 is beyond all 6 steps; all should be done
    expect(stepper.every(s => s.state === 'done')).toBe(true);
  });

  it('negative currentStepIndex treated as -1 (fresh job)', () => {
    const stepper = buildStepper(job({ currentStepIndex: -1 }), []);
    // First step should be next
    expect(stepper[0]?.state).toBe('next');
    expect(stepper.slice(1).every(s => s.state === 'locked')).toBe(true);
  });
});
