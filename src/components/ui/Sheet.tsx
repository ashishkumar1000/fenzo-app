/**
 * Sheet — the Fenzit Design System's bottom sheet, built on the native
 * `TrueSheet` (iOS `UISheetPresentationController`, Android
 * `BottomSheetBehavior`). Unlike the previous Modal-based chrome, the
 * keyboard, gestures, and safe areas are all handled by the OS, so the sheet
 * rides above the keyboard smoothly on both platforms.
 *
 * Controlled API: `visible` presents/dismisses via the ref, and every
 * dismissal path (close button, drag-down, Android back) flows back through
 * `onClose`. The close button routes through `onClose` (not `dismiss()`)
 * so a parent that guards closing — e.g. mid-submit — keeps working for it.
 *
 * Known edges (both inherent to the native sheet):
 * - Drag-down and Android back dismiss natively BEFORE `onClose` runs, so a
 *   guarded parent cannot veto them by refusing inside `onClose` alone — the
 *   sheet closes even mid-submit. Pass `dismissible={false}` for the actual
 *   guard (blocks both paths at the native level); without it, the guard
 *   only blocks the `visible` sync, so if the parent refuses while the sheet
 *   is already gone, the sheet can't be re-presented until the parent flips
 *   `visible` (the old Modal could veto via `onRequestClose`; the native
 *   sheet cannot without `dismissible={false}`).
 * - Tap-outside-to-close (the old Modal backdrop) is not supported by
 *   TrueSheet — dismissal paths are the close button, drag-down and back.
 *
 * Content stays mounted while the sheet is closed, matching the old Modal
 * behaviour; children must tolerate being mounted while hidden.
 */
import React, { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TrueSheet, type TrueSheetProps } from '@lodev09/react-native-true-sheet';
import { X } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { colors, radius, spacing, typography } from '../../theme';

export type SheetProps = {
  /** true presents the native sheet, false dismisses it. */
  visible: boolean;
  /** Called for every dismissal path: close button, drag-down, Android back. */
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Fires once the sheet finished presenting — the right moment to focus
   *  an input (TrueSheet discourages `autoFocus` during presentation). */
  onDidPresent?: () => void;
  /** Sheet heights as screen fractions or keywords. Default `['auto']`
   *  (content-sized — right for short forms). A scrollable form that must
   *  keep its submit button pinned passes a fixed fraction, e.g. `[0.85]`. */
  detents?: TrueSheetProps['detents'];
  /** Lets the content's `ScrollView` hand off drags to the sheet. Only set
   *  it when `children` actually contains a `ScrollView`. */
  scrollable?: boolean;
  /** false blocks every interactive dismissal path — drag-down AND Android
   *  back — at the native level (TrueSheet's own `dismissible` prop), for a
   *  guarded parent (e.g. mid-submit) that must not let the sheet disappear
   *  out from under an in-flight action. Programmatic dismiss via `visible`
   *  still works either way. Default `true` (native default). */
  dismissible?: boolean;
  children: ReactNode;
};

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  onDidPresent,
  detents = ['auto'],
  scrollable = false,
  dismissible = true,
  children,
}: SheetProps) {
  const sheet = useRef<TrueSheet>(null);
  // Tracks whether the native sheet is currently presented, so a close on a
  // never-presented sheet (initial render with visible=false) is a no-op.
  const presentedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      presentedRef.current = true;
      sheet.current?.present();
    } else if (presentedRef.current) {
      presentedRef.current = false;
      sheet.current?.dismiss();
    }
  }, [visible]);

  const handleDidDismiss = () => {
    // A programmatic close already synced state via the `visible` effect —
    // only a native dismissal (drag-down, back, close) needs to call
    // `onClose` here, or the parent's close handler would run twice.
    if (!presentedRef.current) return;
    presentedRef.current = false;
    onClose();
  };

  return (
    <TrueSheet
      ref={sheet}
      detents={detents}
      dismissible={dismissible}
      scrollable={scrollable}
      scrollableOptions={scrollable ? { scrollingExpandsSheet: false } : undefined}
      cornerRadius={radius.xl}
      backgroundColor={colors.surfaceCard}
      grabber
      grabberOptions={{
        width: 40,
        height: 4,
        topMargin: spacing.s2,
        color: colors.borderDefault,
      }}
      dimmed
      dimmedDetentIndex={0}
      onDidDismiss={handleDidDismiss}
      onDidPresent={onDidPresent}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          <IconButton label="Close" size="sm" onPress={onClose}>
            <X size={20} color={colors.textBody} strokeWidth={2} />
          </IconButton>
        </View>

        {children}
      </View>
    </TrueSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.s5,
    // The native grabber renders above this content with its own
    // `topMargin` — without matching top padding here, the title sits
    // right up against it.
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    gap: spacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
