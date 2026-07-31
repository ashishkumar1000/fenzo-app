/**
 * InlineError — a dismissible danger banner for failures that happen *while*
 * usable content is already on screen (a refresh that failed, a background
 * save that didn't land). The screen keeps its data; this explains why it
 * might be stale.
 *
 * Not for blocking failures — when there's nothing to show, use the
 * full-screen error state with a retry instead.
 *
 * Purely presentational: pass the message and the dismissed handler.
 */
import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { colors, palette, radius, spacing, typography } from '../../theme';

export type InlineErrorProps = {
  /** Message to show — `ApiError.message` is safe to pass straight in. */
  message: string;
  /** Omit rendering a non-dismissible banner. */
  onDismiss?: () => void;
};

export function InlineError({ message, onDismiss }: InlineErrorProps) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <AlertTriangle
        size={18}
        color={colors.status.cancelled.fg}
        strokeWidth={2}
      />

      <Text style={styles.message}>{message}</Text>

      {onDismiss ? (
        <IconButton label="Dismiss" size="sm" onPress={onDismiss}>
          <X size={16} color={colors.status.cancelled.fg} strokeWidth={2} />
        </IconButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s2,
    paddingLeft: spacing.s3,
    // Less padding on the right: the dismiss button carries its own 36px box.
    paddingRight: spacing.s1,
    backgroundColor: colors.status.cancelled.bg,
    borderWidth: 1,
    borderColor: colors.status.cancelled.border,
    borderRadius: radius.lg,
  },
  message: {
    ...typography.bodySm,
    color: palette.red800,
    flex: 1,
  },
});
