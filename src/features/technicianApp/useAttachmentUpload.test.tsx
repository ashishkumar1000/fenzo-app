/**
 * Tests for the useAttachmentUpload hook — the React wiring around the pure
 * pipeline (`attachmentUploadModel`): entry lifecycle (added on start,
 * dropped on done/409), parallel files staying independent, the limit flag +
 * callbacks, and a retry re-running the WHOLE action from a fresh presign.
 *
 * The service/transport modules are mocked at their barrels; the pipeline
 * itself is exercised unmocked. A Probe component (react-test-renderer)
 * hosts the hook and mirrors its return value for assertions.
 */
jest.mock('../../services', () => ({
  ...jest.requireActual('../../services'),
  attachmentService: {
    requestUpload: jest.fn(),
    confirmUpload: jest.fn(),
  },
}));
jest.mock('../../utils/r2Upload', () => ({
  putToPresignedUrl: jest.fn(),
}));
jest.mock('../../utils/idempotency', () => ({
  generateIdempotencyKey: jest.fn(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { attachmentService } from '../../services';
import { putToPresignedUrl } from '../../utils/r2Upload';
import { generateIdempotencyKey } from '../../utils/idempotency';
import {
  useAttachmentUpload,
  type PickedFile,
} from './useAttachmentUpload';
import type { UploadEntry } from './attachmentUploadModel';

const requestUpload = attachmentService.requestUpload as jest.Mock;
const confirmUpload = attachmentService.confirmUpload as jest.Mock;
const putMock = putToPresignedUrl as jest.Mock;
const keyMock = generateIdempotencyKey as jest.Mock;

let keyCounter = 0;
beforeEach(() => {
  jest.resetAllMocks();
  keyCounter = 0;
  keyMock.mockImplementation(() => `key-${++keyCounter}`);
  requestUpload.mockResolvedValue({
    presignedPutUrl: 'https://r2.example.com/put?sig=1',
    uploadId: 'upload-1',
    key: 'k-1',
    expiresAt: '2999-01-01T00:00:00.000Z',
  });
  confirmUpload.mockResolvedValue({ id: 'att-1', type: 'photo', createdAt: '2026-09-05T00:01:00.000Z' });
  putMock.mockResolvedValue(2048);
});

function file(name: string): PickedFile {
  return { fileUri: `file:///tmp/${name}.jpg`, filename: `${name}.jpg`, mimeType: 'image/jpeg', fileSize: 2048 };
}

type HookState = {
  entries: UploadEntry[];
  limitReached: boolean;
  start: (files: PickedFile[]) => void;
  retry: (localId: string) => void;
};

let latest: HookState | null = null;

function Probe(props: { jobId: string; onConfirmed?: () => void; onLimit?: () => void }) {
  const hook = useAttachmentUpload({ jobId: props.jobId, attachmentType: 'photo', onConfirmed: props.onConfirmed, onLimit: props.onLimit });
  latest = hook;
  return <Text>{hook.entries.map(e => `${e.localId}:${e.phase}`).join(',')}</Text>;
}

async function renderHook(props: Parameters<typeof Probe>[0]) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Probe {...props} />);
  });
  return renderer;
}

describe('useAttachmentUpload', () => {
  it('runs a picked file to completion: entry added, then dropped with onConfirmed', async () => {
    const onConfirmed = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Probe jobId="job-1" onConfirmed={onConfirmed} />);
    });
    await act(async () => {
      latest!.start([file('a')]);
    });
    // The mocked services resolve within the act flush — the entry's
    // lifecycle has already completed by the time act returns.
    await act(async () => {});
    expect(latest!.entries).toHaveLength(0); // done → tile dropped
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(requestUpload).toHaveBeenCalledWith(
      'job-1',
      { filename: 'a.jpg', mimeType: 'image/jpeg', attachmentType: 'photo' },
      'key-2',
    );
    // The hook wraps the transport with the 10 MB cap (post-read/pre-PUT).
    expect(putMock).toHaveBeenCalledWith('https://r2.example.com/put?sig=1', 'file:///tmp/a.jpg', 'image/jpeg', 10 * 1024 * 1024);
    expect(confirmUpload).toHaveBeenCalledWith('job-1', 'upload-1', 2048, 'key-3');
  });

  it('uploads multiple files in parallel and one failure leaves the rest untouched', async () => {
    putMock.mockImplementation(async (_url, uri) => {
      if (uri.includes('bad')) throw Object.assign(new Error('R2 PUT failed: 500'), { status: 500 });
      return 10;
    });
    await renderHook({ jobId: 'job-1' });
    await act(async () => {
      latest!.start([file('good'), file('bad')]);
    });
    await act(async () => {});
    // The good file dropped (done); the bad one stays as a failed tile.
    expect(latest!.entries).toHaveLength(1);
    expect(latest!.entries[0]).toMatchObject({ filename: 'bad.jpg', phase: 'failed' });
    // Each file presigned independently.
    expect(requestUpload).toHaveBeenCalledTimes(2);
  });

  it('on a 409 drops the entry, sets limitReached and calls onLimit', async () => {
    const onLimit = jest.fn();
    requestUpload.mockRejectedValue(Object.assign(new Error('limit'), { status: 409 }));
    await renderHook({ jobId: 'job-1', onLimit });
    await act(async () => {
      latest!.start([file('a')]);
    });
    await act(async () => {});
    expect(latest!.entries).toHaveLength(0);
    expect(latest!.limitReached).toBe(true);
    expect(onLimit).toHaveBeenCalledTimes(1);
  });

  it('retry(localId) restarts the WHOLE action from presign with a FRESH key', async () => {
    putMock.mockRejectedValueOnce(Object.assign(new Error('R2 PUT failed: 500'), { status: 500 }));
    await renderHook({ jobId: 'job-1' });
    await act(async () => {
      latest!.start([file('a')]);
    });
    await act(async () => {});
    expect(latest!.entries[0]).toMatchObject({ phase: 'failed' });
    expect(requestUpload).toHaveBeenCalledTimes(1);
    await act(async () => {
      latest!.retry(latest!.entries[0].localId);
    });
    await act(async () => {});
    // The retry presigned again (never the old URL) with a new key.
    expect(requestUpload).toHaveBeenCalledTimes(2);
    // Attempt one minted localId + presign keys (it died at the PUT, so no
    // confirm key); the retry mints presign + confirm — 4 keys total.
    expect(keyMock.mock.calls.length).toBe(4);
    const firstPresignKey = requestUpload.mock.calls[0][2];
    const retryPresignKey = requestUpload.mock.calls[1][2];
    expect(retryPresignKey).not.toBe(firstPresignKey);
    expect(latest!.entries).toHaveLength(0); // retry succeeded → dropped
  });

  // Review patch: the reset's state update flushes asynchronously, so a
  // double-tap on Retry could still read the stale 'failed' phase from
  // entriesRef and launch a SECOND pipeline for the same tile.
  it('ignores a retry double-tap while the retry pipeline is in flight', async () => {
    putMock.mockRejectedValueOnce(Object.assign(new Error('R2 PUT failed: 500'), { status: 500 }));
    await renderHook({ jobId: 'job-1' });
    await act(async () => {
      latest!.start([file('a')]);
    });
    await act(async () => {});
    expect(latest!.entries[0]).toMatchObject({ phase: 'failed' });

    // The retried PUT hangs — the pipeline stays in flight for both taps.
    putMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      latest!.retry(latest!.entries[0].localId);
      latest!.retry(latest!.entries[0].localId); // double-tap
    });
    await act(async () => {});
    // 1 initial presign + 1 retry presign — the second tap presigned nothing.
    expect(requestUpload).toHaveBeenCalledTimes(2);
  });

  // Review patch: callbacks (and tile updates) must not fire after unmount —
  // the screen behind them is gone, and a stray refetch would touch a dead
  // screen's state.
  it('does not call onConfirmed when the component unmounts mid-upload', async () => {
    const onConfirmed = jest.fn();
    const renderer = await renderHook({ jobId: 'job-1', onConfirmed });
    let resolvePut!: (size: number) => void;
    putMock.mockImplementation(
      () => new Promise<number>(resolve => { resolvePut = resolve; }),
    );
    await act(async () => {
      latest!.start([file('a')]);
    });
    await act(async () => {});
    expect(latest!.entries).toHaveLength(1); // still uploading
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      resolvePut(2048); // the upload completes AFTER unmount
    });
    await act(async () => {});
    expect(confirmUpload).toHaveBeenCalled(); // the pipeline itself ran on
    expect(onConfirmed).not.toHaveBeenCalled(); // but the screen never heard
  });
});
