/**
 * SignatureTile — the captured customer signature as its own white tile
 * (spec §4: surfaceCard, hairline border, radius.md, s2 padding), shared
 * look with AttachmentGrid's signature row.
 *
 * A null URL (transient signing failure) or an image that fails to load
 * (e.g. an expired presigned URL) renders the sunken image-off placeholder —
 * the pull-to-refresh above is the ONLY retry, never a persisted URL.
 *
 * Key the tile by the attachment's URL at the call site (like AttachmentGrid
 * keys its tiles): a refetch that mints a new presigned URL remounts the
 * tile and clears any `failed` state from the old one.
 */
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { JobAttachment } from '../../../services';

type Props = {
  attachment: JobAttachment;
};

export function SignatureTile({ attachment }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.tile}>
      {!attachment.url || failed ? (
        <View style={styles.placeholder}>
          <ImageOff size={20} color={colors.textDisabled} strokeWidth={2} />
          <Text style={styles.placeholderText}>Tap refresh</Text>
        </View>
      ) : (
        <Image
          source={{ uri: attachment.url }}
          style={styles.image}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
    padding: spacing.s2,
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
  image: {
    width: '100%',
    height: '100%',
  },
});
