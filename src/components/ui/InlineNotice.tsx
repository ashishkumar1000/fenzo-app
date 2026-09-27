/**
 * InlineNotice — a non-error banner for things the screen wants the user to
 * read *while* usable content stays on screen. Three tones:
 *
 *   - `info`    — informational. The holidays impact-warning banner uses
 *                 this (amber; the BE-returned affected employees are
 *                 advisory, not a failure — EXPERIENCE.md is explicit).
 *   - `success` — transient confirmation. Success-saved screens flash this
 *                 briefly. Pass `onDismiss` to dismiss early; without it,
 *                 the parent controls the lifetime (the success banner
 *                 pattern auto-hides after ~1500 ms).
 *   - `neutral` — soft, muted copy for helpful-but-not-important context
 *                 (e.g. "Effective from {date}"). No accent colour.
 *
 * Why this exists instead of reusing `InlineError`: `InlineError` is
 * hard-coded to `colors.status.cancelled.*` (red). The impact banner is
 * amber; transient success is green. A tone prop on `InlineError` would
 * have leaked colours beyond its failure-only contract, so a sibling
 * component is the cleaner split.
 *
 * Purely presentational: pass the message and optional dismiss handler.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Info, X } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { colors, radius, spacing, typography } from '../../theme';

export type InlineNoticeTone = 'info' | 'success' | 'neutral';

export type InlineNoticeProps = {
  /** Message to show. Plain text — callers compose. */
  message: string;
  /** `info` (amber), `success` (green), or `neutral` (gray). Default `info`. */
  tone?: InlineNoticeTone;
  /** Optional dismiss button. Omit for non-dismissible banners. */
  onDismiss?: () => void;
  /** Override the default tone-mapped lucide icon (e.g. for copy that benefits
   *  from a stronger glyph than `Info`). Pass `null` to render no icon at
   *  all — copy-only notice. */
  icon?: React.ReactNode | null;
};

const tonePalette = {
  info: {
    fg: colors.status.scheduled.fg,
    bg: colors.status.scheduled.bg,
    border: colors.status.scheduled.border,
    defaultIcon: Info,
  },
  success: {
    fg: colors.status.done.fg,
    bg: colors.status.done.bg,
    border: colors.status.done.border,
    defaultIcon: CheckCircle2,
  },
  neutral: {
    fg: colors.textMuted,
    bg: colors.surfaceSunken,
    border: colors.borderSubtle,
    defaultIcon: Info,
  },
} as const;

export function InlineNotice({
  message,
  tone = 'info',
  onDismiss,
  icon,
}: InlineNoticeProps) {
  const palette = tonePalette[tone];
  const DefaultIcon = palette.defaultIcon;
  return (
    <View style={[styles.root, { backgroundColor: palette.bg, borderColor: palette.border }]} accessibilityRole="alert">
      {/* `null` means explicitly no icon; `undefined` falls back to the
          tone's default glyph (`??` cannot express the null case). */}
      {icon === undefined ? (
        <DefaultIcon size={18} color={palette.fg} strokeWidth={2} />
      ) : (
        icon
      )}

      <Text style={[styles.message, { color: palette.fg }]}>{message}</Text>

      {onDismiss ? (
        <IconButton label="Dismiss" size="sm" onPress={onDismiss}>
          <X size={16} color={palette.fg} strokeWidth={2} />
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
    paddingRight: spacing.s1,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  message: {
    ...typography.bodySm,
    flex: 1,
  },
});
