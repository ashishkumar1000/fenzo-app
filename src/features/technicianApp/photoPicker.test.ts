/**
 * Tests for the photo picker plumbing: the pure asset validator (mime list,
 * 10 MB boundary) and the Alert-driven source choice — the Android CAMERA
 * permission gate in front of launchCamera and the normalization of picker
 * assets into `PickedFile`s (fallbacks for missing fileName/type/fileSize).
 */
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  MAX_BYTES,
  MAX_PHOTOS,
  showPhotoSourceAlert,
  validateAsset,
  type PickOutcome,
} from './photoPicker';

const alertSpy = jest.spyOn(Alert, 'alert');
const launchCameraMock = launchCamera as jest.Mock;
const launchLibraryMock = launchImageLibrary as jest.Mock;
const permissionRequestMock = jest.spyOn(PermissionsAndroid, 'request');

/** Platform.OS is a plain property in the jest preset — swap it directly. */
function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

beforeEach(() => {
  jest.resetAllMocks();
  alertSpy.mockImplementation(() => {});
  setPlatform('ios');
  permissionRequestMock.mockResolvedValue(
    PermissionsAndroid.RESULTS.GRANTED as never,
  );
});

describe('validateAsset', () => {
  it('accepts the three allowed mimes', () => {
    expect(validateAsset({ mimeType: 'image/jpeg', fileSize: 100 })).toBeNull();
    expect(validateAsset({ mimeType: 'image/png', fileSize: 100 })).toBeNull();
    expect(validateAsset({ mimeType: 'image/heic', fileSize: 100 })).toBeNull();
  });

  it('passes a file at EXACTLY the 10 MB limit', () => {
    expect(validateAsset({ mimeType: 'image/jpeg', fileSize: MAX_BYTES })).toBeNull();
  });

  it('rejects one byte past the 10 MB limit', () => {
    expect(validateAsset({ mimeType: 'image/jpeg', fileSize: MAX_BYTES + 1 })).toBe(
      'Only JPG, PNG or HEIC up to 10 MB',
    );
  });

  it('rejects an unknown mime type (e.g. webp, pdf)', () => {
    expect(validateAsset({ mimeType: 'image/webp', fileSize: 100 })).toBe('Only JPG, PNG or HEIC up to 10 MB');
    expect(validateAsset({ mimeType: 'application/pdf', fileSize: 100 })).toBe('Only JPG, PNG or HEIC up to 10 MB');
  });

  it('accepts an unknown fileSize (picker may omit it) when the mime is allowed', () => {
    expect(validateAsset({ mimeType: 'image/heic', fileSize: 0 })).toBeNull();
  });
});

describe('photo picker limits', () => {
  it('exposes the 5-photo cap and 10 MB cap the contract fixes', () => {
    expect(MAX_PHOTOS).toBe(5);
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

/** Shows the alert and presses button `index`, resolving with the outcome. */
async function pressButton(index: number): Promise<PickOutcome> {
  const outcome = await new Promise<PickOutcome>(resolve => {
    showPhotoSourceAlert(4, resolve);
    const buttons = alertSpy.mock.calls.at(-1)![2]!;
    void buttons[index].onPress?.();
  });
  return outcome;
}

describe('showPhotoSourceAlert', () => {
  it("offers 'Take photo' and 'Choose from gallery' via a native alert", () => {
    showPhotoSourceAlert(4, () => {});
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Add photo');
    expect(buttons?.map(b => b.text)).toEqual(['Take photo', 'Choose from gallery', 'Cancel']);
  });

  it("passes the remaining slots as the gallery's selectionLimit", async () => {
    launchLibraryMock.mockResolvedValue({ assets: [] });
    await pressButton(1);
    expect(launchLibraryMock).toHaveBeenCalledWith(
      { mediaType: 'photo', selectionLimit: 4 },
      undefined,
    );
  });

  it("launches the camera with the contract's options (quality 0.8, no saveToPhotos)", async () => {
    launchCameraMock.mockResolvedValue({ assets: [] });
    await pressButton(0);
    expect(launchCameraMock).toHaveBeenCalledWith(
      { mediaType: 'photo', quality: 0.8, saveToPhotos: false },
      undefined,
    );
  });

  it('normalizes gallery assets, falling back for missing fileName/type', async () => {
    launchLibraryMock.mockResolvedValue({
      assets: [
        { uri: 'file:///tmp/shot.png', fileName: 'shot.png', type: 'image/png', fileSize: 120 },
        { uri: 'file:///tmp/no-meta.jpg', fileSize: 30 }, // no fileName, no type
      ],
    });
    const outcome = await pressButton(1);
    expect(outcome.files).toEqual([
      { fileUri: 'file:///tmp/shot.png', filename: 'shot.png', mimeType: 'image/png', fileSize: 120 },
      {
        fileUri: 'file:///tmp/no-meta.jpg',
        filename: expect.stringContaining('.jpg'),
        mimeType: 'image/jpeg',
        fileSize: 30,
      },
    ]);
    expect(outcome.error).toBeUndefined();
  });

  // iOS's gallery picker reports JPEG as the non-standard `image/jpg` alias;
  // it must be folded to the contract's canonical `image/jpeg` at the picker
  // boundary, or a valid photo is rejected client-side (device-verified bug).
  it('canonicalizes the iOS `image/jpg` alias to `image/jpeg`', async () => {
    launchLibraryMock.mockResolvedValue({
      assets: [
        { uri: 'file:///tmp/ios.jpg', fileName: 'ios.jpg', type: 'image/jpg', fileSize: 4127524 },
      ],
    });
    const outcome = await pressButton(1);
    expect(outcome.files[0].mimeType).toBe('image/jpeg');
    expect(outcome.error).toBeUndefined();
  });

  // Some pickers report HEIC/HEIF files as `image/heif` — the extension path
  // maps `.heif` to `image/heic`, so the type path must fold the same way or
  // the identical file is accepted or rejected depending on which filled in.
  it('canonicalizes the `image/heif` alias to `image/heic`', async () => {
    launchLibraryMock.mockResolvedValue({
      assets: [
        { uri: 'file:///tmp/shot.heic', fileName: 'shot.heic', type: 'image/heif', fileSize: 900 },
      ],
    });
    const outcome = await pressButton(1);
    expect(outcome.files[0].mimeType).toBe('image/heic');
    expect(validateAsset(outcome.files[0])).toBeNull();
  });

  it('reports a camera-permission denial on Android with the fixed copy', async () => {
    setPlatform('android');
    permissionRequestMock.mockResolvedValue(
      PermissionsAndroid.RESULTS.DENIED as never,
    );
    const outcome = await pressButton(0);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      expect.anything(),
    );
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBe('Camera permission is needed to take photos');
    expect(launchCameraMock).not.toHaveBeenCalled();
  });

  it('skips the permission prompt on iOS and goes straight to the camera', async () => {
    launchCameraMock.mockResolvedValue({ assets: [] });
    const outcome = await pressButton(0);
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    expect(outcome.files).toEqual([]);
  });

  it('reports a picker error (errorCode present) as an error', async () => {
    launchLibraryMock.mockResolvedValue({ errorCode: 'camera_unavailable' });
    const outcome = await pressButton(1);
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBeTruthy();
  });

  // Review patch: the camera path must surface errorCode the way the gallery
  // does — an iOS permission denial / camera_unavailable is otherwise a
  // silent dead tap (no inline copy).
  it('reports a camera launcher error (errorCode present) as an error', async () => {
    launchCameraMock.mockResolvedValue({ errorCode: 'camera_unavailable' });
    const outcome = await pressButton(0);
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBeTruthy();
  });

  // Review patch: bare awaits left rejections with no handler — onPicked
  // never fired and the rejection went unhandled. Each path must catch.
  it('catches a camera launcher rejection and reports it as an error', async () => {
    launchCameraMock.mockRejectedValue(new Error('camera crashed'));
    const outcome = await pressButton(0);
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toContain('camera crashed');
  });

  it('catches a gallery launcher rejection and reports it as an error', async () => {
    launchLibraryMock.mockRejectedValue(new Error('gallery crashed'));
    const outcome = await pressButton(1);
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toContain('gallery crashed');
  });

  it('catches an Android permission-request rejection and reports it as an error', async () => {
    setPlatform('android');
    permissionRequestMock.mockRejectedValue(new Error('permission crashed'));
    const outcome = await pressButton(0);
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toContain('permission crashed');
    expect(launchCameraMock).not.toHaveBeenCalled();
  });

  // Review patch: an unknown extension must NOT be laundered into
  // image/jpeg (which sails past validation and 422s at presign forever) —
  // it must normalize to a mime validateAsset rejects.
  it('normalizes an unknown extension to a mime the validator rejects', async () => {
    launchLibraryMock.mockResolvedValue({
      assets: [{ uri: 'file:///tmp/clip.webp', fileName: 'clip.webp', fileSize: 10 }],
    });
    const outcome = await pressButton(1);
    expect(outcome.files).toHaveLength(1);
    expect(validateAsset(outcome.files[0])).not.toBeNull();
  });
});
