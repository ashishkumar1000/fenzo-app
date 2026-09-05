/**
 * Tests for the signature export helpers (Story 3.5 Task 1): the filename
 * the confirm-phase server expects and the constants the screen feeds the
 * upload pipeline with.
 */
import { SIGNATURE_MIME_TYPE, signatureFilename } from './signatureExport';

describe('signatureFilename', () => {
  it('embeds the jobId — one file per job, replaceable server-side', () => {
    expect(signatureFilename('job-1')).toBe('signature-job-1.png');
  });

  it('keeps uuid dashes intact (no mangling)', () => {
    expect(signatureFilename('924e281c-9153-4c11-bd47-fe66d35f3acc')).toBe(
      'signature-924e281c-9153-4c11-bd47-fe66d35f3acc.png',
    );
  });
});

describe('SIGNATURE_MIME_TYPE', () => {
  it('is the wire mime the presign body and PUT carry', () => {
    expect(SIGNATURE_MIME_TYPE).toBe('image/png');
  });
});
