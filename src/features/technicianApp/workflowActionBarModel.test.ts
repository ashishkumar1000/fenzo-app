/**
 * Tests for the workflow action-bar model: what the bottom bar renders for a
 * job (button label per next step, photo-hint pill, completed row, nothing),
 * and how an advance failure classifies into the screen's branches (silent
 * 422 reconcile / 422-no-step refetch / 409 locked / 403 unassigned /
 * offline / generic) — pure logic, no rendering. Story 5.2: labels and photo-hint
 * detection are template-driven.
 */
import type { ActivityLogEntry, ApiError, JobDetail, WorkflowTemplateStep } from '../../services';
import { FALLBACK_ERROR_MESSAGE } from '../../services/api/apiError';
import {
  actionBarAction,
  classifyAdvanceError,
  JOB_LOCKED_MESSAGE,
} from './workflowActionBarModel';

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

function job(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    technicianId: 'tech-1',
    serviceLocation: '12 MG Road, Bengaluru',
    skill: { id: 'skill-1', name: 'AC Service' },
    workflowTemplate: baseTemplate,
    currentStepIndex: null,
    scheduledStart: '2026-09-04T10:00:00.000Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-01T06:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-01T06:00:00.000Z',
    technician: { id: 'tech-1', name: 'Suresh', countryCode: '+91', phoneNumber: '9876543210', skills: [] },
    customer: { id: 'customer-1', name: 'Anita', countryCode: '+91', phoneNumber: '9123456780', address: null, city: null, latitude: null, longitude: null },
    activityLog: [],
    attachments: [],
    ...overrides,
  };
}

function stepLog(stepKey: string, at = '2026-09-04T10:30:00.000Z'): ActivityLogEntry {
  return { id: `log-${stepKey}`, eventType: `step_${stepKey}`, actorId: 'tech-1', metadata: null, createdAt: at };
}

describe('actionBarAction', () => {
  it("fresh job → button with first step's label", () => {
    expect(actionBarAction(job(), [])).toEqual({ kind: 'button', step: 'on_my_way', label: 'On my way' });
  });

  it('mid-chain (currentStepIndex: 0) → next step button with template label', () => {
    expect(actionBarAction(job({ currentStepIndex: 0, currentStep: 'on_my_way', status: 'in_progress' }), [stepLog('on_my_way')]))
      .toEqual({ kind: 'button', step: 'arrived', label: 'Arrived' });
  });

  it('next step is in_progress → button with template label', () => {
    expect(actionBarAction(job({ currentStepIndex: 1, currentStep: 'arrived', status: 'in_progress' }), [stepLog('arrived')]))
      .toEqual({ kind: 'button', step: 'in_progress', label: 'Start work' });
  });

  it('next step has advancesOn=photo_confirm → photo hint pill, not a button', () => {
    expect(actionBarAction(job({ currentStepIndex: 2, currentStep: 'in_progress', status: 'in_progress' }), [stepLog('in_progress')]))
      .toEqual({ kind: 'photoHint' });
  });

  it('next step is signature_captured → button with template label', () => {
    expect(actionBarAction(job({ currentStepIndex: 3, currentStep: 'photos_uploaded', status: 'in_progress' }), [stepLog('photos_uploaded')]))
      .toEqual({ kind: 'button', step: 'signature_captured', label: 'Capture signature' });
  });

  it('next step is completed → button with template label', () => {
    expect(actionBarAction(job({ currentStepIndex: 4, currentStep: 'signature_captured', status: 'in_progress' }), [stepLog('signature_captured')]))
      .toEqual({ kind: 'button', step: 'completed', label: 'Mark complete' });
  });

  it('completed status → the static Job completed row', () => {
    expect(actionBarAction(job({ status: 'completed', currentStepIndex: 5, currentStep: 'completed' }), [stepLog('completed')]))
      .toEqual({ kind: 'completed' });
  });

  it('cancelled → no bar at all', () => {
    expect(actionBarAction(job({ status: 'cancelled' }), [])).toEqual({ kind: 'none' });
  });

  it('custom template with custom labels → uses template labels, not hardcoded strings', () => {
    const customTemplate = {
      version: 1,
      steps: [
        { key: 'start', label: 'Let\'s go', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
        { key: 'finish', label: 'All done', requiresPhoto: false, requiresSignature: false, setsStatus: 'completed', advancesOn: null } as WorkflowTemplateStep,
      ],
    };
    expect(actionBarAction(job({ workflowTemplate: customTemplate, currentStepIndex: 0, currentStep: 'start', status: 'in_progress' }), [stepLog('start')]))
      .toEqual({ kind: 'button', step: 'finish', label: 'All done' });
  });
});

describe('classifyAdvanceError', () => {
  it('422 INVALID_WORKFLOW_STEP → silent reconcile with the server currentStep', () => {
    const err: ApiError = {
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      message: 'Invalid workflow step transition',
      details: { statusCode: 422, error_code: 'INVALID_WORKFLOW_STEP', currentStep: 'arrived' },
    };
    expect(classifyAdvanceError(err)).toEqual({ kind: 'reconcile', currentStep: 'arrived' });
  });

  it('422 with a fresh-job null currentStep still reconciles', () => {
    const err: ApiError = {
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      message: 'Invalid workflow step transition',
      details: { error_code: 'INVALID_WORKFLOW_STEP', currentStep: null },
    };
    expect(classifyAdvanceError(err)).toEqual({ kind: 'reconcile', currentStep: null });
  });

  it('422 WITHOUT a server currentStep in the body → silent refetch, never the raw message', () => {
    const err: ApiError = {
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      message: 'Invalid workflow step transition',
      details: { error_code: 'INVALID_WORKFLOW_STEP' },
    };
    expect(classifyAdvanceError(err)).toEqual({ kind: 'reconcileRefresh' });
  });

  it('the INVALID_WORKFLOW_STEP code alone (wrong status) is NOT a reconcile — generic', () => {
    // Gate is status===422 && code — a 400 carrying the code must not patch
    // the detail from a body that means something else.
    expect(
      classifyAdvanceError({ status: 400, code: 'INVALID_WORKFLOW_STEP', message: 'Bad request' }),
    ).toEqual({ kind: 'generic', message: 'Bad request' });
  });

  it('409 → fixed locked copy (never the raw message), refetch branch', () => {
    const err: ApiError = {
      status: 409,
      code: 'JOB_NOT_MODIFIABLE',
      message: 'Job is not modifiable in its current status',
      details: { error_code: 'JOB_NOT_MODIFIABLE' },
    };
    expect(classifyAdvanceError(err)).toEqual({ kind: 'locked' });
    expect(JOB_LOCKED_MESSAGE).toBe('This job can no longer be updated');
  });

  it('409 with a missing error_code → still locked (keyed on the status, not the code)', () => {
    const err: ApiError = { status: 409, code: 'REQUEST_ERROR', message: 'Conflict' };
    expect(classifyAdvanceError(err)).toEqual({ kind: 'locked' });
  });

  it('403 → unassigned branch (same as a 403 on load — reassigned away)', () => {
    expect(
      classifyAdvanceError({ status: 403, code: 'JOB_NOT_ASSIGNED', message: 'Forbidden' }),
    ).toEqual({ kind: 'unassigned' });
  });

  it('status 0 → offline branch with the error message (Epic 4 will enqueue instead)', () => {
    const err: ApiError = { status: 0, code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection and try again.' };
    expect(classifyAdvanceError(err)).toEqual({
      kind: 'offline',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  });

  it('a non-ApiError shape (no numeric status) → generic fixed copy, never its internals', () => {
    expect(classifyAdvanceError({ message: 'Cannot read property of undefined' } as unknown as ApiError))
      .toEqual({ kind: 'generic', message: FALLBACK_ERROR_MESSAGE });
  });

  it('anything else (401/404/5xx) → generic inline error', () => {
    expect(classifyAdvanceError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Job not found' }))
      .toEqual({ kind: 'generic', message: 'Job not found' });
    expect(classifyAdvanceError({ status: 502, code: 'SERVER_ERROR', message: 'Bad gateway' }))
      .toEqual({ kind: 'generic', message: 'Bad gateway' });
  });
});