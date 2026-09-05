/**
 * PhotoSection — the technician's photo capture grid (Story 3.4, spec §10):
 * confirmed thumbnails, in-flight tiles with the phase overlay, failed tiles
 * with the retry affordance, and the dashed add tile with its limit state.
 *
 * Owns the full capture flow for the Photos card: the add tile opens the
 * native source alert (`photoPicker`), picked assets are validated
 * client-side BEFORE any request (AC 2), and the rejected ones surface the
 * inline copy under the grid — auto-dismissed on the next add action. The
 * upload pipeline itself is `useAttachmentUpload`; a confirm fires
 * `onConfirmed` (the screen's silent detail refetch) so the grid re-renders
 * from server truth (AC 6). Present on terminal jobs read-only: no add tile,
 * no tiles beyond what the server holds.
 *
 * In-flight entries count toward the photo limit (pessimistic — the server's
 * 409 is the backstop), and a 409 flips the add tile to "Limit reached (5)"
 * via the hook's `limitReached` flag (AC 5).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImageOff, Plus, RefreshCw } from 'lucide-react-native';
import { InlineError } from '../../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import type { JobAttachment } from '../../../services';
import {
  MAX_PHOTOS,
  showPhotoSourceAlert,
  validateAsset,
  VALIDATION_MESSAGE,
  type PickOutcome,
} from '../photoPicker';
import {
  useAttachmentUpload,
  type PickedFile,
} from '../useAttachmentUpload';
import type { UploadEntry } from '../attachmentUploadModel';

/** A tile-relevant phase — the hook drops 'done' entries before render. */
type InFlightPhase = Exclude<UploadEntry['phase'], 'done' | 'failed'>;

/** The caption words per in-flight phase (spec §15 vocabulary). */
const PHASE_WORD: Record<InFlightPhase, string> = {
  presigning: 'Preparing',
  uploading: 'Uploading',
  confirming: 'Saving',
};

/** The add-tile copy when the photo cap is hit. */
const LIMIT_CAPTION = `Limit reached (${MAX_PHOTOS})`;

/** The below-grid caption (spec §15). */
const GRID_CAPTION = `Up to ${MAX_PHOTOS} photos · JPG, PNG or HEIC · max 10 MB`;

type Props = {
  jobId: string;
  /** The job's confirmed photos (server truth), oldest first. */
  photos: JobAttachment[];
  /** Read-only: no add tile (a terminal job's photo history). */
  readOnly?: boolean;
  /** Fired per confirmed upload — the screen's silent detail refetch. */
  onConfirmed?: () => void;
};

export function PhotoSection({ jobId, photos, readOnly = false, onConfirmed }: Props) {
  const { entries, limitReached, start, retry } = useAttachmentUpload({
    jobId,
    attachmentType: 'photo',
    onConfirmed,
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Failed tiles don't block new photos — only active uploads count.
  const inFlightActive = entries.filter(e => e.phase !== 'failed').length;
  const atLimit = limitReached || photos.length + inFlightActive >= MAX_PHOTOS;
  const remaining = Math.max(0, MAX_PHOTOS - photos.length - inFlightActive);

  /** Alert callback: validate BEFORE any request (AC 2), then upload. */
  const handlePicked = (outcome: PickOutcome) => {
    if (outcome.error) {
      setValidationError(outcome.error);
      return;
    }
    const valid: PickedFile[] = [];
    let rejected = false;
    for (const asset of outcome.files) {
      if (validateAsset(asset) === null) valid.push(asset);
      else rejected = true;
    }
    // Invalid picks never reach the pipeline; the inline copy explains.
    if (rejected) setValidationError(VALIDATION_MESSAGE);
    if (valid.length > 0) start(valid);
  };

  /** Opens the source choice; the next action dismisses the old inline copy. */
  const openSourceAlert = () => {
    setValidationError(null);
    showPhotoSourceAlert(remaining, handlePicked);
  };

  /** Grid tiles, in display order: confirmed, in-flight, then the add tile. */
  const tiles = [
    ...photos.map(photo => (
      <ConfirmedTile key={`c:${photo.id}`} attachment={photo} />
    )),
    ...entries.map(entry =>
      entry.phase === 'failed' ? (
        <FailedTile key={entry.localId} entry={entry} onRetry={() => retry(entry.localId)} />
      ) : isInFlight(entry) ? (
        <InFlightTile key={entry.localId} entry={entry} />
      ) : null, // 'done' is transient — the hook drops it before render
    ),
    // Read-only means NO add tile (a terminal job's history) — not a disabled
    // one, whose limit caption would be factually wrong on a 2-of-5 job.
    readOnly ? null : atLimit ? (
      <AddTile key="add" disabled onPress={() => {}} />
    ) : (
      <AddTile key="add" onPress={openSourceAlert} />
    ),
  ];

  return (
    <View>
      {chunkRows(tiles).map((row, rowIndex) => (
        // Same row-of-three as AttachmentGrid: exact thirds without measuring.
        <View style={styles.gridRow} key={`row-${rowIndex}`}>
          {row}
          {row.length < 3
            ? Array.from({ length: 3 - row.length }, (_, fillerIndex) => (
                <View key={`filler-${fillerIndex}`} style={[styles.tile, styles.filler]} pointerEvents="none" />
              ))
            : null}
        </View>
      ))}
      {validationError ? (
        <InlineError message={validationError} onDismiss={() => setValidationError(null)} />
      ) : null}
      <Text style={styles.gridCaption}>{GRID_CAPTION}</Text>
    </View>
  );
}

/**
 * Chunk tiles into rows of three; a trailing short row is padded with
 * fillers. Null tiles (a hidden read-only add tile, a transient 'done') are
 * dropped first — tiles are flex:1, so a null slot would stretch its
 * row-mates to half/whole width instead of thirds.
 */
function chunkRows(tiles: React.ReactNode[]): React.ReactNode[][] {
  const visible = tiles.filter(tile => tile !== null);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < visible.length; i += 3) rows.push(visible.slice(i, i + 3));
  return rows;
}

/** Type guard narrowing an entry to the phases InFlightTile renders. */
function isInFlight(entry: UploadEntry): entry is UploadEntry & { phase: InFlightPhase } {
  return entry.phase !== 'done' && entry.phase !== 'failed';
}

/** Confirmed photo — the server's presigned read URL, cover-fit. */
function ConfirmedTile({ attachment }: { attachment: JobAttachment }) {
  // An expired URL or a null one (transient signing failure) renders the
  // sunken placeholder — the refetch the confirm triggered is the retry.
  const [failed, setFailed] = useState(false);
  // A fresh URL (the post-confirm refetch) deserves a fresh image attempt —
  // without this reset a tile that failed once stays failed forever.
  useEffect(() => {
    setFailed(false);
  }, [attachment.url]);
  if (!attachment.url || failed) {
    return (
      <View style={styles.tile}>
        <View style={styles.placeholder}>
          <ImageOff size={20} color={colors.textDisabled} strokeWidth={2} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.tile}>
      <Image source={{ uri: attachment.url }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />
    </View>
  );
}

/** In-flight — the local preview under a scrim with the phase word. */
function InFlightTile({ entry }: { entry: UploadEntry & { phase: InFlightPhase } }) {
  // A local preview that won't load (file moved, transient decode error)
  // falls back to the sunken placeholder — the scrim carries the state.
  const [previewFailed, setPreviewFailed] = useState(false);
  return (
    <View style={styles.tile}>
      {previewFailed ? (
        <View style={styles.placeholder}>
          <ImageOff size={20} color={colors.textDisabled} strokeWidth={2} />
        </View>
      ) : (
        <Image
          source={{ uri: entry.fileUri }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setPreviewFailed(true)}
        />
      )}
      <View style={styles.scrim} pointerEvents="none">
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.phaseWord}>{PHASE_WORD[entry.phase]}</Text>
      </View>
    </View>
  );
}

/** Failed — dimmed preview, bottom strip with the retry affordance. */
function FailedTile({ entry, onRetry }: { entry: UploadEntry; onRetry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retry upload"
      onPress={onRetry}
      style={styles.tile}>
      <Image source={{ uri: entry.fileUri }} style={[styles.image, styles.failedImage]} resizeMode="cover" />
      <View style={styles.failedStrip} pointerEvents="none">
        <Text style={styles.failedText}>Failed</Text>
        <RefreshCw size={14} color={colors.status.cancelled.fg} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

/** The dashed add tile; disabled (limit) shows the cap copy instead. */
function AddTile({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const plus = disabled ? colors.textDisabled : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={disabled ? LIMIT_CAPTION : 'Add photo'}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.tile, styles.addTile, disabled && styles.addTileDisabled]}>
      <Plus size={22} color={plus} strokeWidth={2} />
      <Text style={[styles.addText, disabled && { color: colors.textDisabled }]}>
        {disabled ? LIMIT_CAPTION : 'Add photo'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginBottom: spacing.s2,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  // Row filler for a trailing short row: same footprint, fully invisible.
  filler: {
    backgroundColor: 'transparent',
  },
  // The in-flight overlay (spec §10): full-tile dark scrim.
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    backgroundColor: 'rgba(17,24,39,0.45)',
  },
  phaseWord: {
    ...typography.caption,
    color: colors.surfaceCard,
  },
  // The failed strip hugs the tile's bottom edge.
  failedStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    paddingVertical: spacing.s1,
    backgroundColor: colors.status.cancelled.bg,
  },
  failedText: {
    ...typography.caption,
    color: colors.status.cancelled.fg,
  },
  // Spec §10: the failed tile's preview is dimmed under the strip.
  failedImage: {
    opacity: 0.5,
  },
  // The add tile: dashed border, centered glyph + caption.
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderDefault,
    backgroundColor: 'transparent',
    minHeight: touch.min,
  },
  addTileDisabled: {
    borderColor: colors.borderSubtle,
  },
  addText: {
    ...typography.caption,
    color: colors.primary,
  },
  gridCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
