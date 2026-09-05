/**
 * photoPicker.ts
 * ──────────────
 * The camera/gallery plumbing between `react-native-image-picker` and the
 * upload hook (`useAttachmentUpload`), for Story 3.4's Photos section and
 * reused by 3.5's signature capture.
 *
 * Flow: `showPhotoSourceAlert` opens the native choice (spec §15), the
 * chosen launcher runs, and the result is normalized into `PickedFile`s
 * (with fallbacks — iOS camera results can arrive without fileName/type).
 * Client-side validation is `validateAsset`, a PURE function so the
 * 10 MB/mime rules are testable on their own; callers run it on every
 * picked asset BEFORE anything reaches the network, filter the rejects out
 * and surface the inline copy.
 *
 * Android camera needs the runtime CAMERA permission BEFORE launchCamera —
 * requested here so callers can't forget it. The gallery path uses the
 * system Photo Picker on modern Android and needs no storage permission.
 */
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { PickedFile } from './useAttachmentUpload';

/** The attachment contract's photo cap (server-enforced at 5 too). */
export const MAX_PHOTOS = 5;

/** The attachment contract's per-file size cap. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** Mimes the backend accepts for attachments (HEIC passes untranscoded). */
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/heic'];

/** The inline copy for a rejected asset (spec §15) — shared with PhotoSection. */
export const VALIDATION_MESSAGE = 'Only JPG, PNG or HEIC up to 10 MB';

/** The Android denial copy (AC 1). */
export const CAMERA_PERMISSION_MESSAGE = 'Camera permission is needed to take photos';

/**
 * Pure validator: null when the asset may upload, else the inline copy.
 * An unknown `fileSize` (0 — pickers can omit it) passes: the pipeline
 * measures the authoritative size at PUT time, so the client never blocks
 * on a value it doesn't have.
 */
export function validateAsset(asset: { mimeType: string; fileSize: number }): string | null {
  if (!ALLOWED_MIMES.includes(asset.mimeType)) return VALIDATION_MESSAGE;
  if (asset.fileSize > MAX_BYTES) return VALIDATION_MESSAGE;
  return null;
}

/** What a picker run hands back: normalized files, or a reason it gave up. */
export type PickOutcome = {
  files: PickedFile[];
  error?: string;
};

/**
 * Opens the native "Add photo" choice. `remaining` = how many more photos
 * the job may take (drives the gallery's `selectionLimit`). The outcome —
 * files or error — arrives asynchronously via `onPicked`.
 */
export function showPhotoSourceAlert(
  remaining: number,
  onPicked: (outcome: PickOutcome) => void,
): void {
  Alert.alert('Add photo', undefined, [
    { text: 'Take photo', onPress: () => void takePhoto(onPicked) },
    {
      text: 'Choose from gallery',
      onPress: () =>
        void pickFromGallery(Math.min(remaining, MAX_PHOTOS), onPicked),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/** Camera path: Android's runtime permission first, then launchCamera. */
async function takePhoto(onPicked: (outcome: PickOutcome) => void): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera permission',
        message: CAMERA_PERMISSION_MESSAGE,
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        onPicked({ files: [], error: CAMERA_PERMISSION_MESSAGE });
        return;
      }
    }
    const res = await launchCamera(
      { mediaType: 'photo', quality: 0.8, saveToPhotos: false },
      undefined,
    );
    // Mirrors the gallery check: a denial or camera_unavailable otherwise
    // normalizes to { files: [] } with no error — a silent dead tap.
    if (res.errorCode) {
      onPicked({ files: [], error: res.errorMessage ?? 'Could not open the camera' });
      return;
    }
    onPicked(normalize(res.assets));
  } catch (caught) {
    onPicked({ files: [], error: String(caught) });
  }
}

/** Gallery path: the remaining-slot count becomes the selectionLimit. */
async function pickFromGallery(
  selectionLimit: number,
  onPicked: (outcome: PickOutcome) => void,
): Promise<void> {
  try {
    const res = await launchImageLibrary(
      { mediaType: 'photo', selectionLimit },
      undefined,
    );
    if (res.errorCode) {
      onPicked({ files: [], error: res.errorMessage ?? 'Could not open the gallery' });
      return;
    }
    onPicked(normalize(res.assets));
  } catch (caught) {
    onPicked({ files: [], error: String(caught) });
  }
}

/** Maps picker assets to `PickedFile`s, filling the gaps iOS leaves blank. */
function normalize(assets: Asset[] | undefined): PickOutcome {
  if (!assets || assets.length === 0) {
    return { files: [] }; // user cancelled — not an error
  }
  const files = assets
    .filter(a => a.uri)
    .map(a => {
      const filename = a.fileName ?? defaultName(a.uri!);
      return {
        fileUri: a.uri!,
        filename,
        mimeType: canonicalMime(a.type ?? mimeFromName(filename)),
        fileSize: a.fileSize ?? 0,
      };
    });
  return { files };
}

/** `photo-1730000000000.jpg` — a camera shot with no fileName from the picker. */
function defaultName(uri: string): string {
  return `photo-${Date.now()}${extensionOf(uri) ?? '.jpg'}`;
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : null;
}

/**
 * Picker-reported aliases folded to the canonical mimes the contract and
 * backend accept — at the picker boundary, before validation or any request
 * sees them. `image/jpg` is iOS's non-standard alias for JPEG; `image/heif`
 * is HEIC's sibling container that some pickers report for `.heic`/`.heif`
 * files. Without the fold, the SAME file is accepted when its type is
 * missing (the extension path maps `.heif` → `image/heic`) but rejected when
 * the picker supplies `image/heif`.
 */
function canonicalMime(mime: string): string {
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'image/heif') return 'image/heic';
  return mime;
}

/**
 * Extension-based mime guess for assets whose `type` came back blank.
 * Only KNOWN image extensions are guessed — anything else returns a
 * non-allowed mime so `validateAsset` rejects it, instead of defaulting to
 * `image/jpeg` and laundering a webp/gif past validation into a PUT that
 * deterministically 422s at presign.
 */
function mimeFromName(name: string): string {
  const ext = (extensionOf(name) ?? '').toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.heic':
    case '.heif':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}
