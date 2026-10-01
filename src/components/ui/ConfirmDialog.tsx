/**
 * ConfirmDialog — the Fenzit Design System's reusable confirmation modal
 * (Story 20-1): a centred card on a dark scrim for the "one more
 * confirmation" before a mutating action (leave cancel/convert, and any
 * future approve/deny/delete).
 *
 * Anatomy (the Confirm Regularization reference): icon badge + close X on
 * the header row, a strong title, a rich body (`message` is a ReactNode —
 * callers compose bold dates/names inside it), an OPTIONAL detail card of
 * label/value rows (values take ReactNode — chips like "Absent → Present"
 * render inline), then the primary confirm button and a soft secondary
 * that both close.
 *
 * Dismissal is always safe: the scrim, the X and the secondary all route
 * to the same `onCancel`; while `submitting` the primary spins and the
 * dialog cannot be dismissed (the write must settle — the same posture
 * the Sheet's `dismissible={false}` gives a guarded parent).
 */
import React, { type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { colors, radius, shadow, spacing, typography } from '../../theme';

export type ConfirmDialogRow = {
  label: string;
  /** ReactNode — plain text, or chips/arrows composed by the caller. */
  value: ReactNode;
};

export type ConfirmDialogProps = {
  /** true presents the modal; false dismisses. */
  visible: boolean;
  /** The question ("Cancel leave request?") — sentence case, no emoji. */
  title: string;
  /** The richer body copy — compose bold segments with nested Text. */
  message: ReactNode;
  /** Optional label/value rows in the bordered detail card. */
  rows?: ConfirmDialogRow[];
  /** The confirm button's label ("Cancel request", "Yes, convert"). */
  confirmLabel: string;
  /** 'danger' for a destructive confirm (Cancel leave); default primary. */
  confirmVariant?: 'primary' | 'danger';
  /** The header badge's glyph (the reference's ✓ in the blue circle). */
  icon?: ReactNode;
  /** The secondary's label; defaults to "Go back". */
  cancelLabel?: string;
  /** Shows the primary's inline spinner and blocks every dismissal. */
  submitting?: boolean;
  onConfirm: () => void;
  /** Every non-confirm exit: scrim tap, X, secondary button. */
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  rows,
  confirmLabel,
  confirmVariant = 'primary',
  icon,
  cancelLabel = 'Go back',
  submitting = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={submitting ? undefined : onCancel}>
      {/* The scrim doubles as the cancel tap target (a press OUTSIDE the
          card fires it; a press on the card lands on the card). */}
      <Pressable
        style={[styles.scrim, { paddingBottom: insets.bottom + spacing.s6 }]}
        onPress={submitting ? undefined : onCancel}
        accessibilityLabel={cancelLabel}
        accessibilityRole="button">
        <View
          accessible
          accessibilityViewIsModal
          accessibilityLabel={`${title}. ${cancelLabel} available.`}
          style={styles.card}>
          <View style={styles.headerRow}>
            {icon != null ? (
              <View style={styles.iconBadge}>{icon}</View>
            ) : null}
            <IconButton
              variant="ghost"
              size="sm"
              disabled={submitting}
              onPress={onCancel}
              label={cancelLabel}>
              <X size={18} color={colors.textMuted} strokeWidth={2} />
            </IconButton>
          </View>

          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          <Text style={styles.message} maxFontSizeMultiplier={1.4}>
            {message}
          </Text>

          {rows != null && rows.length > 0 ? (
            <View style={styles.rowsCard}>
              {rows.map((row, index) => (
                // The label is human copy — duplicate labels are legal, so
                // the key carries the index too.
                <View key={`${row.label}-${index}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <View style={styles.rowValue}>{row.value}</View>
                </View>
              ))}
            </View>
          ) : null}

          <Button
            variant={confirmVariant}
            size="lg"
            fullWidth
            loading={submitting}
            disabled={submitting}
            onPress={onConfirm}>
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={submitting}
            onPress={onCancel}>
            {cancelLabel}
          </Button>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s5,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius['2xl'],
    padding: spacing.s5,
    gap: spacing.s3,
    ...shadow.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading,
    fontSize: 22,
    color: colors.textStrong,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowsCard: {
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.s3,
    gap: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  rowLabel: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
});