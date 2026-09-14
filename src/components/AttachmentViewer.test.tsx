/**
 * Render tests for AttachmentViewer (Story 9-1): the header contract (close
 * button, counter vs "Customer signature" label), the signature page's white
 * card, the failure placeholder on image error, and the flicker guard —
 * the image index is captured ONCE at open and never updated while open.
 *
 * The real react-native-image-viewing renders under jest (its Modal mock
 * renders children); image loading itself never fires, so the per-page
 * states are exercised by driving the Image's onLoad/onError callbacks.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AttachmentViewer, type ViewerItem } from './AttachmentViewer';
import { colors, spacing, typography } from '../theme';

/** Zero top inset: the iOS header padding is `insetTop + spacing.s5`, so a
 * zero inset keeps the token assertion deterministic. */
const SAFE_METRICS = {
  insets: { top: 0, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

const PHOTO_A: ViewerItem = {
  id: 'a',
  kind: 'photo',
  url: 'https://r2.example.com/photo-a',
};
const PHOTO_B: ViewerItem = {
  id: 'b',
  kind: 'photo',
  url: 'https://r2.example.com/photo-b',
};
const SIGNATURE: ViewerItem = {
  id: 's',
  kind: 'signature',
  url: 'https://r2.example.com/signature',
};

type Props = Parameters<typeof AttachmentViewer>[0];

async function render(props: Partial<Props> & Pick<Props, 'items'>) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <SafeAreaProvider initialMetrics={SAFE_METRICS}>
        <AttachmentViewer visible={false} initialIndex={0} onClose={() => {}} {...props} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

/** Every Text rendered inside the tree (leaf string children). */
function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(t => typeof t.props.children === 'string', { deep: true })
    .map(t => t.props.children as string);
}

async function openWith(
  renderer: ReactTestRenderer,
  props: Partial<Props> & Pick<Props, 'items'>,
) {
  await act(async () => {
    renderer.update(
      <SafeAreaProvider initialMetrics={SAFE_METRICS}>
        <AttachmentViewer visible initialIndex={0} onClose={() => {}} {...props} />
      </SafeAreaProvider>,
    );
  });
}

describe('AttachmentViewer', () => {
  it('renders nothing while closed', async () => {
    const renderer = await render({ items: [PHOTO_A, SIGNATURE] });
    expect(renderer.root.findAll(t => t.props.source, { deep: true })).toHaveLength(0);
  });

  it('shows the close button and the counter on open', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B, SIGNATURE] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B, SIGNATURE] });
    const close = renderer.root.find(
      t => t.props.accessibilityLabel === 'Close',
    );
    expect(close).toBeTruthy();
    expect(texts(renderer)).toContain('1 of 3');
  });

  it('labels the signature page "Customer signature" instead of a counter', async () => {
    const renderer = await render({ items: [PHOTO_A, SIGNATURE] });
    await openWith(renderer, { items: [PHOTO_A, SIGNATURE], initialIndex: 1 });
    expect(texts(renderer)).toContain('Customer signature');
    expect(texts(renderer)).not.toContain('2 of 2');
  });

  it('keeps the counter an accessibility live region (polite)', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B] });
    const counter = renderer.root.find(
      t => t.props.children === '1 of 2',
    );
    expect(counter.props.accessibilityLiveRegion).toBe('polite');
  });

  it('hides the counter for a single-item viewer', async () => {
    const renderer = await render({ items: [PHOTO_A] });
    await openWith(renderer, { items: [PHOTO_A] });
    expect(texts(renderer)).not.toContain('1 of 1');
  });

  it('opens positioned on the tapped index (initialScrollIndex)', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B, SIGNATURE] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B, SIGNATURE], initialIndex: 2 });
    expect(renderer.root.find(t => t.props.initialScrollIndex !== undefined).props.initialScrollIndex).toBe(2);
  });

  it('freezes the index at open — later prop changes do not touch it (flicker guard)', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B, SIGNATURE] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B, SIGNATURE], initialIndex: 0 });
    // Re-rendering with a different initialIndex while OPEN must not move
    // the viewer (upstream remounts on imageIndex change — issue #209).
    await act(async () => {
      renderer.update(
        <SafeAreaProvider initialMetrics={SAFE_METRICS}>
          <AttachmentViewer visible initialIndex={2} onClose={() => {}} items={[PHOTO_A, PHOTO_B, SIGNATURE]} />
        </SafeAreaProvider>,
      );
    });
    expect(renderer.root.find(t => t.props.initialScrollIndex !== undefined).props.initialScrollIndex).toBe(0);
  });

  it('renders the signature page on the white card token', async () => {
    const renderer = await render({ items: [PHOTO_A, SIGNATURE] });
    await openWith(renderer, { items: [PHOTO_A, SIGNATURE], initialIndex: 1 });
    // The page container carries the surfaceCard background (pageStyle).
    expect(
      renderer.root.findAll(
        t =>
          Array.isArray(t.props.style) &&
          t.props.style.some(
            (s: { backgroundColor?: string }) =>
              s?.backgroundColor === colors.surfaceCard,
          ),
        { deep: true },
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders the failure placeholder ("Tap refresh") when an image errors', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B] });
    const image = renderer.root.find(t => t.props.source?.uri === PHOTO_A.url && t.props.onError);
    await act(async () => {
      image.props.onError();
    });
    expect(texts(renderer)).toContain('Tap refresh');
  });

  it('closes via the close button', async () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <SafeAreaProvider initialMetrics={SAFE_METRICS}>
          <AttachmentViewer visible={false} initialIndex={0} onClose={onClose} items={[PHOTO_A]} />
        </SafeAreaProvider>,
      );
    });
    await act(async () => {
      renderer.update(
        <SafeAreaProvider initialMetrics={SAFE_METRICS}>
          <AttachmentViewer visible initialIndex={0} onClose={onClose} items={[PHOTO_A]} />
        </SafeAreaProvider>,
      );
    });
    const close = renderer.root.find(t => t.props.accessibilityLabel === 'Close');
    await act(async () => {
      close.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes gracefully when the initial index is beyond the item list', async () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AttachmentViewer visible={false} initialIndex={0} onClose={onClose} items={[PHOTO_A]} />);
    });
    await act(async () => {
      renderer.update(
        <AttachmentViewer visible initialIndex={5} onClose={onClose} items={[PHOTO_A]} />,
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAll(t => t.props.source, { deep: true })).toHaveLength(0);
  });

  // Review patch (2026-09-14): a negative index must trip the same
  // stale-open guard as an out-of-range one.
  it('closes gracefully when the initial index is negative', async () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AttachmentViewer visible={false} initialIndex={0} onClose={onClose} items={[PHOTO_A]} />);
    });
    await act(async () => {
      renderer.update(
        <AttachmentViewer visible initialIndex={-1} onClose={onClose} items={[PHOTO_A]} />,
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAll(t => t.props.source, { deep: true })).toHaveLength(0);
  });

  // Review decision (2026-09-14, (a)): closing must not hard-cut — the
  // session stays mounted through the Modal's exit fade, then is released.
  it('stays mounted through the exit fade and releases after it', async () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <SafeAreaProvider initialMetrics={SAFE_METRICS}>
            <AttachmentViewer visible={false} initialIndex={0} onClose={onClose} items={[PHOTO_A]} />
          </SafeAreaProvider>,
        );
      });
      await act(async () => {
        renderer.update(
          <SafeAreaProvider initialMetrics={SAFE_METRICS}>
            <AttachmentViewer visible initialIndex={0} onClose={onClose} items={[PHOTO_A]} />
          </SafeAreaProvider>,
        );
      });
      await act(async () => {
        renderer.update(
          <SafeAreaProvider initialMetrics={SAFE_METRICS}>
            <AttachmentViewer visible={false} initialIndex={0} onClose={onClose} items={[PHOTO_A]} />
          </SafeAreaProvider>,
        );
      });
      // The session is held through the fade window: the lib still receives
      // `visible={false}` (on device the Modal plays the fade; the jest Modal
      // mock cuts to null immediately, so assert on the prop instead).
      const held = renderer.root.findAll(
        t => t.props.animationType === 'fade' && t.props.visible === false,
        { deep: true },
      );
      expect(held.length).toBeGreaterThan(0);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(
        renderer.root.findAll(t => t.props.animationType === 'fade' && t.props.visible === false, { deep: true }),
      ).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  // Review patch (2026-09-14): the Testing section claimed a spinner test —
  // here it is: the lib's loader is styled with the brand primary token.
  it('spins the brand primary while an image loads', async () => {
    const renderer = await render({ items: [PHOTO_A] });
    await openWith(renderer, { items: [PHOTO_A] });
    const viewer = renderer.root.find(t => t.props.loadingColor !== undefined);
    expect(viewer.props.loadingColor).toBe(colors.primary);
  });

  it('styles the header and counter with viewer tokens', async () => {
    const renderer = await render({ items: [PHOTO_A, PHOTO_B] });
    await openWith(renderer, { items: [PHOTO_A, PHOTO_B] });
    const header = renderer.root.find(t => t.props.testID === 'attachment-viewer-header');
    // The style is an array: the token base plus the live top inset (zero in
    // tests, so the padding is exactly the token).
    const headerStyles = Array.isArray(header.props.style) ? header.props.style : [header.props.style];
    expect(headerStyles.some((s: { paddingTop?: number }) => s?.paddingTop === spacing.s5)).toBe(true);
    const counterText = renderer.root.find(t => t.props.testID === 'attachment-viewer-counter-text');
    expect(counterText.props.style.color).toBe(colors.onPrimary);
  });
});
