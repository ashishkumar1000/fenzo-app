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
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { AttachmentViewer, type ViewerItem } from '../../../components/AttachmentViewer';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { JobAttachment } from '../../../services';

type Props = {
  attachments: JobAttachment[];
  /** 3.5 re-capture affordance — a ghost button under the signature tile. */
  onRecapture?: () => void;
};

/**
 * 9-1 — this grid's viewer list: viewable photos in grid order, then the
 * captured signature page. Null URLs are excluded (nothing to show), so the
 * tile numbering counts only what the viewer actually holds.
 */
function viewerListOf(attachments: JobAttachment[]): ViewerItem[] {
  const items: ViewerItem[] = attachments
    .filter(a => a.type === 'photo' && a.url)
    .map(a => ({ id: a.id, kind: 'photo', url: a.url as string }));
  // Server is last-write-wins on signatures (a re-capture appends) — display
  // the LAST captured one, matching TechJobDetailContent (code review
  // 2026-09-14: `.find` surfaced the stale first capture).
  const signature = attachments.filter(a => a.type === 'signature' && a.url).slice(-1)[0];
  if (signature?.url) {
    items.push({ id: signature.id, kind: 'signature', url: signature.url });
  }
  return items;
}

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

/** Photo tile — the server's presigned read URL, cover-fit.
 *  9-1: a loaded tile is tappable to open the full-screen viewer; the
 *  placeholder (null url / load failure) stays inert. */
function PhotoTile({
  attachment,
  viewIndex,
  total,
  onOpen,
}: {
  attachment: JobAttachment;
  /** Index in the viewer list (-1 = not viewable → inert placeholder). */
  viewIndex: number;
  total: number;
  onOpen?: (index: number) => void;
}) {
  // An expired presigned URL renders a broken image client-side — treat the
  // image's own error the same as a null URL (the refetch above is the retry).
  const [failed, setFailed] = useState(false);
  // Handler-gated (code review 2026-09-14): without `onOpen` the tile must
  // not advertise itself as tappable (SignatureTile's pattern).
  if (!attachment.url || failed || viewIndex < 0) {
    return (
      <View style={styles.tile}>
        <Placeholder />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={onOpen ? 'imagebutton' : undefined}
      accessibilityLabel={onOpen ? `View photo ${viewIndex + 1} of ${total}` : undefined}
      onPress={onOpen ? () => onOpen(viewIndex) : undefined}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <Image
        source={{ uri: attachment.url }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

/** The signature tile — same null/failed handling, full-width and `contain`.
 *  9-1: a captured signature is tappable to open the viewer on its page. */
function SignatureTile({ url, onView }: { url: string | null; onView?: () => void }) {
  const [failed, setFailed] = useState(false);
  const captured = Boolean(url) && !failed && Boolean(onView);
  if (!url || failed) {
    return <Placeholder />;
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel="View customer signature"
      onPress={captured ? onView : undefined}
      style={({ pressed }) => [styles.signaturePressable, captured && pressed && styles.tilePressed]}>
      <Image
        source={{ uri: url }}
        style={styles.signatureImage}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

export function AttachmentGrid({ attachments, onRecapture }: Props) {
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; initialIndex: number } | null>(null);
  // Stable close callback — a fresh arrow every render defeats
  // memo(ActiveViewer) (code review 2026-09-14).
  const closeViewer = useCallback(() => setViewer(null), []);
  const photos = attachments.filter(a => a.type === 'photo');
  const signature = attachments.find(a => a.type === 'signature');
  // 9-1 — the viewer list and its total (photos + signature), computed from
  // the same snapshot the tiles are numbered against.
  const viewerItems = viewerListOf(attachments);

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
              viewIndex={
                attachment.url ? viewerItems.findIndex(i => i.id === attachment.id) : -1
              }
              total={viewerItems.length}
              onOpen={index => setViewer({ items: viewerItems, initialIndex: index })}
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
            <SignatureTile
              key={signature.url ?? 'none'}
              url={signature.url}
              onView={() => setViewer({ items: viewerItems, initialIndex: viewerItems.length - 1 })}
            />
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

      {/* 9-1 — the grid-owned full-screen gallery (Modal-hosted by the viewer). */}
      <AttachmentViewer
        visible={viewer !== null}
        items={viewer?.items ?? []}
        initialIndex={viewer?.initialIndex ?? 0}
        onClose={closeViewer}
      />
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
  // 9-1 — the tappable signature image fills its card.
  signaturePressable: {
    flex: 1,
  },
  // 9-1 press feedback: opacity dim (AC 6 allows scale or opacity).
  tilePressed: {
    opacity: 0.85,
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