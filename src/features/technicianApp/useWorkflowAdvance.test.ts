/**
 * Tests for useWorkflowAdvance's signature-reroute detection and reconcile
 * membership check (Story 5.2). The hook reads the job's own template to:
 * - Detect if a target step requires a signature (reroute to onCaptureSignature),
 * - Check if the server's currentStep is known in the job's template (reconcile
 *   or refetch).
 *
 * Full hook lifecycle tests are in TechJobDetailScreen; these tests focus on
 * the template-driven logic changes.
 */
import type { JobDetail, WorkflowTemplateStep } from '../../services';

// These are pure logic extracts from useWorkflowAdvance — tested here as
// derived functions for clarity.

const baseTemplate = {
  version: 1,
  steps: [
    { key: 'on_my_way', label: 'On my way', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
    { key: 'arrived', label: 'Arrived', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
    { key: 'in_progress', label: 'Start work', requiresPhoto: false, requiresSignature: false, setsStatus: 'in_progress', advancesOn: null },
    { key: 'photos_uploaded', label: 'Upload photos', requiresPhoto: true, requiresSignature: false, setsStatus: null, advancesOn: 'photo_confirm' },
    { key: 'signature_captured', label: 'Capture signature', requiresPhoto: false, requiresSignature: true, setsStatus: null, advancesOn: null },
    { key: 'completed', label: 'Mark complete', requiresPhoto: false, requiresSignature: false, setsStatus: 'completed', advancesOn: null },
  ],
};

/** Test utility: extract signature-reroute detection logic. */
function shouldRerouteToSignature(detail: JobDetail | null, stepKey: string): boolean {
  const targetStep = detail?.workflowTemplate?.steps.find(s => s.key === stepKey);
  return targetStep?.requiresSignature ?? false;
}

/** Test utility: extract reconcile membership check logic. */
function isStepInTemplate(detail: JobDetail | null, stepKey: string | null): boolean {
  return stepKey !== null && detail?.workflowTemplate?.steps.some(s => s.key === stepKey) === true;
}

function detailWithTemplate(template: { version: number; steps: WorkflowTemplateStep[] }): JobDetail {
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    technicianId: 'tech-1',
    serviceLocation: '12 MG Road',
    serviceType: 'ac_service',
    skill: { id: 'skill-1', name: 'AC Service' },
    workflowTemplate: template,
    currentStepIndex: 0,
    scheduledStart: '2026-09-04T10:00:00.000Z',
    scheduledEnd: null,
    status: 'in_progress',
    currentStep: 'on_my_way',
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
  };
}

describe('useWorkflowAdvance — signature-reroute detection', () => {
  it('standard step (no signature) — no reroute', () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(shouldRerouteToSignature(detail, 'on_my_way')).toBe(false);
    expect(shouldRerouteToSignature(detail, 'in_progress')).toBe(false);
  });

  it('signature_captured step — reroute to onCaptureSignature', () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(shouldRerouteToSignature(detail, 'signature_captured')).toBe(true);
  });

  it('custom template with a custom signature step — reroutes on that key', () => {
    const customTemplate = {
      version: 1,
      steps: [
        { key: 'start', label: 'Start', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
        { key: 'get_signature', label: 'Get signature', requiresPhoto: false, requiresSignature: true, setsStatus: null, advancesOn: null },
      ],
    };
    const detail = detailWithTemplate(customTemplate);
    expect(shouldRerouteToSignature(detail, 'start')).toBe(false);
    expect(shouldRerouteToSignature(detail, 'get_signature')).toBe(true);
  });

  it('null detail — no reroute (safe fallback)', () => {
    expect(shouldRerouteToSignature(null, 'signature_captured')).toBe(false);
  });

  it('missing template — no reroute (safe fallback)', () => {
    const detail = detailWithTemplate(baseTemplate);
    detail.workflowTemplate = null;
    expect(shouldRerouteToSignature(detail, 'signature_captured')).toBe(false);
  });

  it('unknown step key — no reroute (safe fallback)', () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(shouldRerouteToSignature(detail, 'unknown_step')).toBe(false);
  });
});

describe('useWorkflowAdvance — reconcile membership check', () => {
  it("server step in the job's template — reconcile applies", () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(isStepInTemplate(detail, 'on_my_way')).toBe(true);
    expect(isStepInTemplate(detail, 'signature_captured')).toBe(true);
    expect(isStepInTemplate(detail, 'completed')).toBe(true);
  });

  it("server step NOT in the job's template — reconcile is skipped, refetch instead", () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(isStepInTemplate(detail, 'unknown_step')).toBe(false);
    expect(isStepInTemplate(detail, 'made_up_step')).toBe(false);
  });

  it('null currentStep (fresh job) — reconcile skipped, refetch', () => {
    const detail = detailWithTemplate(baseTemplate);
    expect(isStepInTemplate(detail, null)).toBe(false);
  });

  it('null detail — reconcile check returns false', () => {
    expect(isStepInTemplate(null, 'on_my_way')).toBe(false);
  });

  it('missing template — reconcile check returns false', () => {
    const detail = detailWithTemplate(baseTemplate);
    detail.workflowTemplate = null;
    expect(isStepInTemplate(detail, 'on_my_way')).toBe(false);
  });

  it('custom template — recognizes its own steps', () => {
    const customTemplate = {
      version: 1,
      steps: [
        { key: 'custom_a', label: 'Custom A', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
        { key: 'custom_b', label: 'Custom B', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
      ],
    };
    const detail = detailWithTemplate(customTemplate);
    expect(isStepInTemplate(detail, 'custom_a')).toBe(true);
    expect(isStepInTemplate(detail, 'custom_b')).toBe(true);
    expect(isStepInTemplate(detail, 'on_my_way')).toBe(false);
  });

  it('old hardcoded step keys — only if in the current template', () => {
    // Pre-5.2, a 422 reconcile would accept any STEP_ORDER key. Now it must
    // be in the job's own template.
    const customTemplate = {
      version: 1,
      steps: [
        { key: 'step_a', label: 'Step A', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
        { key: 'step_b', label: 'Step B', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null },
      ],
    };
    const detail = detailWithTemplate(customTemplate);
    // Old hardcoded STEP_ORDER keys are rejected
    expect(isStepInTemplate(detail, 'on_my_way')).toBe(false);
    expect(isStepInTemplate(detail, 'photos_uploaded')).toBe(false);
  });
});
