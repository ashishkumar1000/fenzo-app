/**
 * Render tests for the PhotoSection (spec §10): the tile states (confirmed,
 * in-flight with its phase word, failed with retry, add / limit), the
 * below-grid caption, and the add flow's client-side validation — a rejected
 * asset never reaches the upload and surfaces the inline copy instead.
 *
 * The upload hook and the source alert are mocked; the picker's own tests
 * cover the alert internals and the validator.
 */
jest.mock('../useAttachmentUpload', () => ({
  useAttachmentUpload: jest.fn(),
  confirmOnly: jest.fn(),
}));
jest.mock('../photoPicker', () => ({
  ...jest.requireActual('../photoPicker'),
  showPhotoSourceAlert: jest.fn(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { PhotoSection } from './PhotoSection';
import { useAttachmentUpload } from '../useAttachmentUpload';
import { showPhotoSourceAlert } from '../photoPicker';
import type { UploadEntry } from '../attachmentUploadModel';

const useHook = useAttachmentUpload as jest.Mock;
const alertMock = showPhotoSourceAlert as jest.Mock;

/** A confirmed photo as the detail response carries it. */
function photo(id: string, url: string | null = 'https://r2.example.com/read-1') {
  return { id, type: 'photo' as const, url, createdAt: '2026-09-05T00:01:00.000Z' };
}

function entry(partial: Partial<UploadEntry> & { localId: string }): UploadEntry {
  return {
    fileUri: `file:///tmp/${partial.localId}.jpg`,
    filename: `${partial.localId}.jpg`,
    mimeType: 'image/jpeg',
    phase: 'presigning',
    ...partial,
  };
}

type HookReturn = ReturnType<typeof useAttachmentUpload>;

function hookReturn(partial: Partial<HookReturn>): HookReturn {
  return {
    entries: [],
    limitReached: false,
    start: jest.fn(),
    retry: jest.fn(),
    ...partial,
  };
}

/** The alert mock's captured "picker result" callback (set in render). */
let picked: (files: unknown[], error?: string) => void;

type PhotoSectionProps = Parameters<typeof PhotoSection>[0];

async function render(props: Partial<PhotoSectionProps> = {}) {
  alertMock.mockImplementation((_remaining, onPicked) => {
    picked = onPicked as typeof picked;
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <View>
        <PhotoSection jobId="job-1" photos={[]} {...props} />
      </View>,
    );
  });
  return renderer;
}

/** Presses the enabled add tile, opening the (mocked) source alert. */
async function pressAddTile(renderer: ReactTestRenderer) {
  const addTile = pressables(renderer).find(p => p.props.accessibilityLabel === 'Add photo');
  await act(async () => {
    addTile!.props.onPress();
  });
}

/** Every Text rendered inside the tree (leaf string children). */
function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(t => typeof t.props.children === 'string', { deep: true })
    .map(t => t.props.children as string);
}

/** Host Pressables only (role 'button') — the tile components themselves also
 * receive an onPress/onRetry prop and must not match. */
function pressables(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    t => typeof t.props.onPress === 'function' && t.props.accessibilityRole === 'button',
    { deep: true },
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  useHook.mockReturnValue(hookReturn({}));
});

describe('PhotoSection', () => {
  it('renders confirmed photos as tiles plus the below-grid caption', async () => {
    const renderer = await render({ photos: [photo('a'), photo('b')] });
    expect(texts(renderer)).toContain('Up to 5 photos · JPG, PNG or HEIC · max 10 MB');
  });

  // Review patch: a tile whose URL failed once must try again when the
  // refetch delivers a FRESH url — not stay on the placeholder forever.
  it('gives a confirmed tile a fresh image attempt when its url changes', async () => {
    const renderer = await render({ photos: [photo('a')] });
    const failedImage = renderer.root.find(t => t.props.source?.uri === 'https://r2.example.com/read-1');
    await act(async () => {
      failedImage.props.onError();
    });
    // Load failure → the sunken placeholder (no Image rendered).
    expect(renderer.root.findAll(t => t.props.source, { deep: true })).toHaveLength(0);
    await act(async () => {
      renderer.update(
        <View>
          <PhotoSection jobId="job-1" photos={[photo('a', 'https://r2.example.com/read-2')]} />
        </View>,
      );
    });
    expect(
      renderer.root.findAll(t => t.props.source?.uri === 'https://r2.example.com/read-2', { deep: true })
        .length,
    ).toBeGreaterThan(0); // the fresh URL is being attempted again
  });

  it('renders an in-flight tile with its phase word', async () => {
    useHook.mockReturnValue(
      hookReturn({ entries: [entry({ localId: 'e1', phase: 'uploading' })] }),
    );
    const renderer = await render({});
    expect(texts(renderer)).toContain('Uploading');
  });

  it('renders a failed tile whose press retries the whole action', async () => {
    const retry = jest.fn();
    useHook.mockReturnValue(hookReturn({ entries: [entry({ localId: 'e1', phase: 'failed' })], retry }));
    const renderer = await render({});
    expect(texts(renderer)).toContain('Failed');
    const retryTile = pressables(renderer).find(p => p.props.accessibilityLabel === 'Retry upload');
    expect(retryTile).toBeTruthy();
    await act(async () => {
      retryTile!.props.onPress();
    });
    expect(retry).toHaveBeenCalledWith('e1');
  });

  it('shows "Limit reached (5)" and blocks the add tile when the limit flag is set', async () => {
    useHook.mockReturnValue(hookReturn({ limitReached: true }));
    const renderer = await render({});
    expect(texts(renderer)).toContain(LIMIT_CAPTION_TEXT);
    const addTile = pressables(renderer).find(p => p.props.accessibilityLabel === 'Add photo');
    expect(addTile).toBeUndefined(); // the disabled tile carries the limit label instead
  });

  it('opens the source alert from the add tile with the remaining slot count', async () => {
    useHook.mockReturnValue(hookReturn({}));
    const renderer = await render({ photos: [photo('a')] });
    const addTile = pressables(renderer).find(p => p.props.accessibilityLabel === 'Add photo');
    await act(async () => {
      addTile!.props.onPress();
    });
    expect(alertMock).toHaveBeenCalledWith(4, expect.any(Function));
  });

  it('uploads only valid picks and surfaces the inline copy for rejected ones', async () => {
    const start = jest.fn();
    useHook.mockReturnValue(hookReturn({ start }));
    const renderer = await render({});
    await pressAddTile(renderer);
    await act(async () => {
      alertMock.mock.calls.at(-1)![1]({
        files: [
          { fileUri: 'file:///tmp/ok.jpg', filename: 'ok.jpg', mimeType: 'image/jpeg', fileSize: 100 },
          { fileUri: 'file:///tmp/big.jpg', filename: 'big.jpg', mimeType: 'image/jpeg', fileSize: 10 * 1024 * 1024 + 1 },
        ],
      });
    });
    expect(start).toHaveBeenCalledWith([
      { fileUri: 'file:///tmp/ok.jpg', filename: 'ok.jpg', mimeType: 'image/jpeg', fileSize: 100 },
    ]);
    expect(texts(renderer)).toContain('Only JPG, PNG or HEIC up to 10 MB');
  });

  it("shows the picker's error (camera permission denial) as the inline copy", async () => {
    const start = jest.fn();
    useHook.mockReturnValue(hookReturn({ start }));
    const renderer = await render({});
    await pressAddTile(renderer);
    await act(async () => {
      alertMock.mock.calls.at(-1)![1]({ files: [], error: 'Camera permission is needed to take photos' });
    });
    expect(start).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Camera permission is needed to take photos');
  });

  // Read-only must hide the add tile ENTIRELY — a disabled one renders the
  // limit caption ("Limit reached (5)"), factually wrong on a 2-of-5 job,
  // and this test only catches that if it checks the caption too (the
  // disabled tile's label is the caption, not 'Add photo').
  it('hides the add tile on a read-only (terminal) render', async () => {
    const renderer = await render({ photos: [photo('a')], readOnly: true });
    expect(
      pressables(renderer).find(p => p.props.accessibilityLabel === 'Add photo'),
    ).toBeUndefined();
    expect(texts(renderer)).not.toContain(LIMIT_CAPTION_TEXT);
    expect(
      pressables(renderer).find(p => p.props.accessibilityLabel === LIMIT_CAPTION_TEXT),
    ).toBeUndefined();
  });

  it('counts in-flight tiles toward the limit (confirmed + in-flight >= 5)', async () => {
    useHook.mockReturnValue(
      hookReturn({
        entries: [1, 2, 3, 4].map(i => entry({ localId: `e${i}`, phase: 'uploading' })),
      }),
    );
    const renderer = await render({ photos: [photo('a')] });
    expect(texts(renderer)).toContain(LIMIT_CAPTION_TEXT);
    expect(pressables(renderer).find(p => p.props.accessibilityLabel === 'Add photo')).toBeUndefined();
  });
});

const LIMIT_CAPTION_TEXT = 'Limit reached (5)';
