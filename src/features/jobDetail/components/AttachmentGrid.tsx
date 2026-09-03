/**
 * AttachmentGrid — a job's photos as a 3-column thumbnail grid, with the
 * customer signature in its own full-width row below (spec §4). Shared by
 * the owner detail (1.2) and the technician detail (3.2, which passes
 * `onRecapture`); dumb by design: props in, UI out.
 *
 * URLs arrive presigned from the detail call and are rendered straight from
 * screen state — a null `url` (transient signing failure) or an image that
 * fails to load (e.g. an expired presigned URL) renders a placeholder with a
 * retry hint; a refetch is the ONLY retry, never a persisted URL.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { JobAttachment } from '../../../services';

type Props = {
  attachments: JobAttachment[];
  /** 3.5 re-capture affordance — a ghost button under the signature tile. */
  onRecapture?: () => void;
};

/** Photos in their arrival order, chunked 3-up so tiles are exactly equal. */
function inRowsOfThree(photos: JobAttachment[]): JobAttachment[][] {
  const rows: JobAttachment[][] = [];
  for (let i = 0; i < photos.length; i += 3) {
    rows.push(photos.slice(i, i + 3));
  }
  return rows;
}

/** Sunken tile with the image-off glyph and the "pull to refresh" hint. */
function Placeholder() {
  return (
    <View style={styles.placeholder}>
      <ImageOff size={20} color={colors.textDisabled} strokeWidth={2} />
      <Text style={styles.placeholderText}>Tap refresh</Text>
    </View>
  );
}

function PhotoTile({ attachment }: { attachment: JobAttachment }) {
  // An expired presigned URL renders a broken image client-side — treat the
  // image's own error the same as a null URL (the refetch above is the retry).
  const [failed, setFailed] = useState(false);
  if (!attachment.url || failed) {
    return (
      <View style={styles.tile}>
        <Placeholder />
      </View>
    );
  }
  return (
    <View style={styles.tile}>
      <Image
        source={{ uri: attachment.url }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

/** The signature tile — same null/failed handling, full-width and `contain`. */
function SignatureTile({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <Placeholder />;
  }
  return (
    <Image
      source={{ uri: url }}
      style={styles.signatureImage}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

export function AttachmentGrid({ attachments, onRecapture }: Props) {
  const photos = attachments.filter(a => a.type === 'photo');
  const signature = attachments.find(a => a.type === 'signature');

  return (
    <View>
      {inRowsOfThree(photos).map((row, rowIndex) => (
        // Row-per-three keeps every tile exactly one-third wide without
        // measuring the container (a wrap+percent mix would leave a ragged edge).
        <View style={styles.gridRow} key={row.map(a => a.id).join('-')}>
          {row.map(attachment => (
            // Keyed by id + url: a refetch that regenerates the presigned URL
            // remounts the tile, clearing any `failed` state from the old URL.
            <PhotoTile
              key={`${attachment.id}:${attachment.url ?? 'none'}`}
              attachment={attachment}
            />
          ))}
          {/* A trailing short row must not stretch its tiles — pad it with
              invisible, non-interactable fillers so each stays one-third. */}
          {row.length < 3
            ? Array.from({ length: 3 - row.length }, (_, fillerIndex) => (
                <View
                  key={`filler-${fillerIndex}`}
                  style={[styles.tile, styles.filler]}
                  pointerEvents="none"
                  testID="attachment-filler"
                />
              ))
            : null}
        </View>
      ))}

      {signature ? (
        <View style={styles.signatureRow}>
          <Text style={styles.signatureLabel}>Customer signature</Text>
          <View style={styles.signatureTile}>
            <SignatureTile key={signature.url ?? 'none'} url={signature.url} />
          </View>
          {onRecapture ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={onRecapture}
              style={styles.recapture}>
              Re-capture
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
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
  // Row filler for a trailing short row: same footprint, fully invisible.
  filler: {
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // A null/failed URL — sunken tile, an image-off glyph and the hint that
  // the pull-to-refresh above is the way to fix it.
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfaceSunken,
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textDisabled,
  },
  signatureRow: {
    marginTop: spacing.s1,
  },
  signatureLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.s2,
  },
  signatureTile: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
    padding: spacing.s2,
  },
  signatureImage: {
    width: '100%',
    height: '100%',
  },
  recapture: {
    alignSelf: 'flex-end',
    marginTop: spacing.s2,
  },
});