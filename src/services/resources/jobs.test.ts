/**
 * Tests for the jobs service: workflow advance (the idempotency key is minted
 * by the CALLER — never inside the service — so Epic 4 can replay the same
 * key for a queued action) and the create/update bodies passing through
 * verbatim, completion flags included.
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    post: jest.fn().mockResolvedValue({ data: { id: 'job-1' } }),
    patch: jest.fn().mockResolvedValue({ data: { id: 'job-1' } }),
  },
}));

import { apiClient } from '../api/apiClient';
import { jobService } from './jobs';
import type { ApiJob } from './jobs';

const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const JOB: ApiJob = {
  id: 'job-1',
  jobNumber: 'JB-2026-0042',
  tenantId: 'tenant-1',
  customerId: 'customer-1',
  technicianId: 'tech-1',
  serviceLocation: '12 MG Road, Bengaluru',
  serviceType: 'ac_service',
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
};

describe('jobService.advanceWorkflow', () => {
  it('posts { step } to /jobs/:id/workflow with the X-Idempotency-Key header', async () => {
    post.mockResolvedValueOnce({ data: JOB });
    const returned = await jobService.advanceWorkflow('job-1', 'on_my_way', '11111111-2222-4333-8444-555555555555');
    expect(returned).toBe(JOB);
    expect(post).toHaveBeenCalledWith(
      '/jobs/job-1/workflow',
      { step: 'on_my_way' },
      { headers: { 'X-Idempotency-Key': '11111111-2222-4333-8444-555555555555' } },
    );
  });

  it('returns the returned ApiJob untouched', async () => {
    post.mockResolvedValueOnce({ data: { ...JOB, currentStep: 'arrived' } });
    const returned = await jobService.advanceWorkflow('job-1', 'arrived', 'aaaaaaa1-b2b2-4c3c-8d4d-e5e5e5e5e5e5');
    expect(returned.currentStep).toBe('arrived');
  });
});

describe('jobService.create', () => {
  it('posts the body verbatim to /jobs with skillId and none of the dropped keys', async () => {
    post.mockResolvedValueOnce({ data: JOB });
    const input = {
      customerId: 'customer-1',
      technicianId: 'tech-1',
      skillId: 'sk-1',
      scheduledStart: '2026-09-04T10:00:00.000Z',
      serviceLocation: '12 MG Road, Bengaluru',
    };
    await jobService.create(input);
    expect(post).toHaveBeenCalledWith('/jobs', input);
    // Story 4.4/4.3 wire contract: `serviceType` is replaced by `skillId`,
    // and the completion flags are gone from the create body (the backend
    // strips them — edit-flow-only via PATCH since then).
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('serviceType');
    expect(body).not.toHaveProperty('requireCompletionPhoto');
    expect(body).not.toHaveProperty('requireCompletionSignature');
  });
});

describe('jobService.update', () => {
  it('PATCHes the body verbatim to /jobs/:id, completion flags included', async () => {
    patch.mockResolvedValueOnce({ data: JOB });
    const input = { requireCompletionPhoto: true, requireCompletionSignature: false };
    await jobService.update('job-1', input);
    expect(patch).toHaveBeenCalledWith('/jobs/job-1', input);
  });
});
