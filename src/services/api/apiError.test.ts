/**
 * Tests for the ApiError detail-extraction helper: the workflow 422 carries
 * `currentStep` at the top level of the error body (verified against
 * fenzit-be's GlobalExceptionFilter + workflow.service.ts) and the helper's
 * `undefined`-vs-`null` distinction is how callers tell "not a step error"
 * apart from "step error for a fresh job".
 */
import { workflowCurrentStep, type ApiError } from './apiError';

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 422, code: 'REQUEST_ERROR', message: 'x', ...overrides };
}

describe('workflowCurrentStep', () => {
  it('reads currentStep from details on an INVALID_WORKFLOW_STEP error', () => {
    const err = apiError({
      code: 'INVALID_WORKFLOW_STEP',
      details: { statusCode: 422, error_code: 'INVALID_WORKFLOW_STEP', currentStep: 'arrived' },
    });
    expect(workflowCurrentStep(err)).toBe('arrived');
  });

  it('returns null (not undefined) when the body carries currentStep: null', () => {
    // currentStep is null while no step has been taken — a real wire state.
    const err = apiError({
      code: 'INVALID_WORKFLOW_STEP',
      details: { error_code: 'INVALID_WORKFLOW_STEP', currentStep: null },
    });
    expect(workflowCurrentStep(err)).toBeNull();
  });

  it('returns undefined for any other error code (not a reconcile case)', () => {
    const err = apiError({
      code: 'JOB_NOT_MODIFIABLE',
      details: { error_code: 'JOB_NOT_MODIFIABLE', currentStep: 'arrived' },
    });
    expect(workflowCurrentStep(err)).toBeUndefined();
  });

  it('returns undefined when details are absent', () => {
    const err = apiError({ code: 'INVALID_WORKFLOW_STEP' });
    expect(workflowCurrentStep(err)).toBeUndefined();
  });
});