/**
 * AttachmentViewer — full-screen gallery viewer for a job's captured
 * attachments (Story 9-1). ONE pager: photos in arrival order, the customer
 * signature last, shared by both job detail screens (owner AttachmentGrid
 * and technician PhotoSection/SignatureTile).
 *
 * Wraps react-native-image-viewing (installed dependency, see the bun patch
 * in patches/): the patch adds `ImageErrorComponent`, `loadingColor` and a
 * per-page `getPageStyle` — upstream has no onError path (a dead presigned
 * URL would spin forever, AC5) and no way to style one page differently
 * (the signature needs a white page so pale ink strokes stay visible).
 *
 * FLICKER GUARD — the #1 integration trap: upstream remounts the whole
 * viewer whenever the `imageIndex` prop changes (`key={props.imageIndex}`,
 * issue #209). So the viewer captures `items` + `initialIndex` ONCE per
 * open session and never updates them while open; swipes inside the viewer
 * are internal to the library. Each open creates a fresh snapshot of the
 * attachment URLs (presigned, 1-hour TTL — never persisted, never stale).
 */
import { memo, useCallback, useEffect, useState } from 'react';
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageViewing from 'react-native-image-viewing';
import { ImageOff, X } from 'lucide-react-native';
import { IconButton } from './ui';
import { colors, radius, spacing, touch, typography } from '../theme';

export type ViewerItem = { id: string; kind: 'photo' | 'signature'; url: string };

type Props = {
  visible: boolean;
  /** Photos in arrival order, signature last (if present). */
  items: ViewerItem[];
  /** Index of the tapped tile — captured once at open. */
  initialIndex: number;
  onClose: () => void;
};

/** The snapshot a single open session shows; frozen for the session. */
type Session = { items: ViewerItem[]; initialIndex: number };

/** The header row's top inset on Android — the lib's StatusBarManager hides
 * the status bar there (the app must not also manage it for this screen), so
 * a fixed token spacing is deterministic. On iOS the lib's manager is inert
 * (returns null), so the header hides the status bar itself and pads below
 * the notch via the safe-area inset (code review 2026-09-14, decision (a)). */
const HEADER_TOP = spacing.s5;

/** RN Modal's default fade duration (~300ms) plus a small buffer — the exit
 * fade the lib's Modal plays while we keep the session mounted (code review
 * 2026-09-14, decision (a)). */
const EXIT_FADE_MS = 350;

export function AttachmentViewer({ visible, items, initialIndex, onClose }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  // The exit-fade window: after `visible` drops, the session stays mounted
  // for the Modal's fade, then is released.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (visible) {
      setDismissed(false);
      // A stale open (the list shrank or shifted under a captured index)
      // closes gracefully instead of opening on a broken pager (UX §6.4).
      if (items.length === 0 || initialIndex < 0 || initialIndex >= items.length) {
        onClose();
        setSession(null);
        return;
      }
      setSession({ items, initialIndex });
      return;
    }
    // The fade-out: unmounting synchronously skips the Modal's `fade` exit —
    // keep it mounted through the window, then release.
    if (session) {
      setDismissed(true);
      const timer = setTimeout(() => {
        setSession(null);
        setDismissed(false);
      }, EXIT_FADE_MS);
      return () => clearTimeout(timer);
    }
    // Keyed on `visible` only, deliberately: items/initialIndex are frozen
    // per session — updating them mid-session would remount the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!session) return null;
  return <ActiveViewer session={session} visible={!dismissed} onClose={onClose} />;
}

/** The open viewer, memoized so a parent screen re-render never re-enters
 * the library with changed props while a session is active. The patch now
 * passes `visible` through to the lib's Modal (upstream early-returns null),
 * so the dismissal above plays the Modal's fade instead of a hard cut. */
const ActiveViewer = memo(function ActiveViewer({
  session,
  visible,
  onClose,
}: {
  session: Session;
  /** Drives the lib's Modal — false during the exit-fade window. */
  visible: boolean;
  onClose: () => void;
}) {
  const { items, initialIndex } = session;
  const images = items.map(item => ({ uri: item.url }));
  // The patched lib's prop type is `(index) => ViewStyle`; photos get an
  // empty style (the dark backdrop shows through) and the signature page
  // gets the white card.
  const getPageStyle = useCallback(
    (index: number): ViewStyle =>
      items[index]?.kind === 'signature' ? (styles.signaturePage as ViewStyle) : {},
    [items],
  );

  return (
    <ImageViewing
      images={images}
      keyExtractor={(_src, index) => items[index].id}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      animationType="fade"
      backgroundColor={colors.backdropDark}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      ImageErrorComponent={FailurePlaceholder}
      // A single spinner colour for all pages — brand primary reads on both
      // the dark photo pages and the white signature page.
      loadingColor={colors.primary}
      getPageStyle={getPageStyle}
      HeaderComponent={props => <Header {...props} items={items} onClose={onClose} />}
    />
  );
});

/**
 * Header — transparent strip over the backdrop: close (top-left, ≥44px) and
 * a centre counter ("2 of 6"), replaced by "Customer signature" on the
 * signature page; hidden entirely for a single-item viewer. The counter is
 * a polite live region so screen readers announce page changes.
 */
function Header({
  imageIndex,
  items,
  onClose,
}: {
  imageIndex: number;
  items: ViewerItem[];
  onClose: () => void;
}) {
  // iOS parity (code review 2026-09-14): the lib's StatusBarManager is inert
  // on iOS, so this header hides the status bar itself (reverted on unmount)
  // and pads below the notch with the safe-area inset; Android keeps the
  // fixed token inset.
  const { top: insetTop } = useSafeAreaInsets();
  const headerTop = Platform.OS === 'ios' ? insetTop + HEADER_TOP : HEADER_TOP;
  const current = items[imageIndex];
  const label =
    current?.kind === 'signature'
      ? 'Customer signature'
      : items.length > 1
        ? `${imageIndex + 1} of ${items.length}`
        : null;
  return (
    <View
      style={[styles.header, { paddingTop: headerTop }]}
      testID="attachment-viewer-header"
      pointerEvents="box-none">
      {Platform.OS === 'ios' ? <StatusBar hidden barStyle="light-content" /> : null}
      <View style={[styles.counter, { top: headerTop }]} pointerEvents="none">
        {label ? (
          <Text
            style={styles.counterText}
            testID="attachment-viewer-counter-text"
            accessibilityLiveRegion="polite">
            {label}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRow} pointerEvents="box-none">
        <IconButton label="Close" variant="ghost" size="md" onPress={onClose}>
          <X size={24} color={colors.onPrimary} strokeWidth={2} />
        </IconButton>
      </View>
    </View>
  );
}

/**
 * Failure page (AC5) — the grids' placeholder vocabulary, no retry affordance
 * inside the viewer (pull-to-refresh on the detail screen is the only retry).
 * Anchored to the first viewport: the Android pager's scroll container is
 * two viewports tall (swipe-to-close room), so a flex-filled child would
 * centre below the fold.
 */
function FailurePlaceholder() {
  // Live viewport height — Dimensions.get is frozen at import time and goes
  // stale after rotation/foldable resize (code review 2026-09-14).
  const { height } = useWindowDimensions();
  return (
    <View style={[styles.failure, { height }]} pointerEvents="none">
      <View style={styles.failurePanel}>
        <ImageOff size={20} color={colors.textDisabled} strokeWidth={2} />
        <Text style={styles.failureText}>Tap refresh</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.s2,
  },
  headerRow: {
    height: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Centre column behind the row — the counter sits dead-centre regardless
  // of the close button's width.
  counter: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  // The signature page: white card so ink strokes keep their contrast.
  signaturePage: {
    backgroundColor: colors.surfaceCard,
  },
  // Anchored to the first viewport of the (up to two-viewport) page; the
  // height comes from useWindowDimensions, live per resize.
  failure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failurePanel: {
    width: '80%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  failureText: {
    ...typography.caption,
    color: colors.textDisabled,
  },
});
