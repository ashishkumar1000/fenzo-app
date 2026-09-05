/**
 * Tests for the attachments service: both phases of the R2 upload contract
 * must carry a caller-minted `X-Idempotency-Key` (the key is minted by the
 * CALLER, never inside the service, so a retry mints a fresh one and Epic 4
 * can replay a queued confirm with its stored key).
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from '../api/apiClient';
import { attachmentService } from './attachments';

const post = apiClient.post as jest.Mock;

const PRESIGN = {
  presignedPutUrl: 'https://r2.example.com/put?sig=1',
  uploadId: 'upload-1',
  key: 'tenants/t1/jobs/j1/photo-1.jpg',
  expiresAt: '2026-09-05T00:15:00.000Z',
};

const CONFIRMED = { id: 'att-1', type: 'photo', createdAt: '2026-09-05T00:01:00.000Z' };

describe('attachmentService.requestUpload', () => {
  it('posts the presign body with the X-Idempotency-Key header', async () => {
    post.mockResolvedValueOnce({ data: PRESIGN });
    const returned = await attachmentService.requestUpload(
      'job-1',
      { filename: 'photo-1.jpg', mimeType: 'image/jpeg', attachmentType: 'photo' },
      '11111111-2222-4333-8444-555555555555',
    );
    expect(returned).toBe(PRESIGN);
    expect(post).toHaveBeenCalledWith(
      '/jobs/job-1/attachments',
      { filename: 'photo-1.jpg', mimeType: 'image/jpeg', attachmentType: 'photo' },
      { headers: { 'X-Idempotency-Key': '11111111-2222-4333-8444-555555555555' } },
    );
  });

  it('accepts the signature attachment type', async () => {
    await attachmentService.requestUpload(
      'job-1',
      { filename: 'sig.png', mimeType: 'image/png', attachmentType: 'signature' },
      '22222222-3333-4444-8555-666666666666',
    );
    expect(post).toHaveBeenCalledWith(
      '/jobs/job-1/attachments',
      { filename: 'sig.png', mimeType: 'image/png', attachmentType: 'signature' },
      { headers: { 'X-Idempotency-Key': '22222222-3333-4444-8555-666666666666' } },
    );
  });
});

describe('attachmentService.confirmUpload', () => {
  it('posts sizeBytes to the confirm endpoint with the X-Idempotency-Key header', async () => {
    post.mockResolvedValueOnce({ data: CONFIRMED });
    const returned = await attachmentService.confirmUpload(
      'job-1',
      'upload-1',
      2048,
      '33333333-4444-5555-8666-777777777777',
    );
    expect(returned).toBe(CONFIRMED);
    expect(post).toHaveBeenCalledWith(
      '/jobs/job-1/attachments/upload-1/confirm',
      { sizeBytes: 2048 },
      { headers: { 'X-Idempotency-Key': '33333333-4444-5555-8666-777777777777' } },
    );
  });
});