/**
 * Render tests for AttachmentGrid's viewer affordance (Story 9-1, Task 5):
 * the owner detail's grid tiles are tappable imagebuttons into the same
 * full-screen viewer, the grid owns the viewer session internally, and the
 * placeholder / re-capture surfaces stay inert.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AttachmentGrid } from './AttachmentGrid';
import type { JobAttachment } from '../../../services';

const SAFE_METRICS = {
  insets: { top: 0, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

function photo(id: string, url: string | null = 'https://r2.example.com/p'): JobAttachment {
  return { id, type: 'photo', url, createdAt: '2026-09-05T00:01:00.000Z' };
}

function signature(url: string | null = 'https://r2.example.com/sig'): JobAttachment {
  return { id: 'sig-1', type: 'signature', url, createdAt: '2026-09-05T01:00:00.000Z' };
}

async function render(props: Parameters<typeof AttachmentGrid>[0]) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    // SafeAreaProvider: the viewer header reads the iOS safe-area inset.
    renderer = create(
      <SafeAreaProvider initialMetrics={SAFE_METRICS}>
        <AttachmentGrid {...props} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

/** Host nodes with the imagebutton role and a press handler. */
function imagebuttons(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    t => t.props.accessibilityRole === 'imagebutton' && typeof t.props.onPress === 'function',
    { deep: true },
  );
}

function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(t => typeof t.props.children === 'string', { deep: true })
    .map(t => t.props.children as string);
}

describe('AttachmentGrid — gallery-view tappable tiles (Story 9-1)', () => {
  it('photo tiles are imagebuttons labelled with their viewer position', async () => {
    const renderer = await render({ attachments: [photo('p1'), photo('p2'), signature()] });
    expect(imagebuttons(renderer).map(t => t.props.accessibilityLabel)).toEqual([
      'View photo 1 of 3',
      'View photo 2 of 3',
      'View customer signature',
    ]);
  });

  it('pressing a photo tile opens the viewer on that photo (counter + page)', async () => {
    const renderer = await render({
      attachments: [photo('p1'), photo('p2', 'https://r2.example.com/p2'), signature()],
    });
    const second = imagebuttons(renderer).find(t => t.props.accessibilityLabel === 'View photo 2 of 3');
    await act(async () => {
      second!.props.onPress();
    });
    expect(texts(renderer)).toContain('2 of 3');
    expect(
      renderer.root.findAll(t => t.props.source?.uri === 'https://r2.example.com/p2', { deep: true }).length,
    ).toBeGreaterThan(0);
  });

  it('pressing the signature tile opens the viewer on the signature page', async () => {
    const renderer = await render({ attachments: [photo('p1'), signature()] });
    const sig = imagebuttons(renderer).find(t => t.props.accessibilityLabel === 'View customer signature');
    await act(async () => {
      sig!.props.onPress();
    });
    expect(texts(renderer)).toContain('Customer signature');
    // The signature page is the LAST item — no photo-count label over it.
    expect(texts(renderer)).not.toContain('2 of 2');
  });

  // Review patch (2026-09-14): signatures are last-write-wins — a re-capture
  // appends, so the LAST captured signature is the live one.
  it('opens the viewer on the LAST captured signature (re-capture wins)', async () => {
    const recaptured = {
      id: 'sig-2',
      type: 'signature' as const,
      url: 'https://r2.example.com/sig-2',
      createdAt: '2026-09-05T02:00:00.000Z',
    };
    const renderer = await render({
      attachments: [photo('p1'), signature('https://r2.example.com/sig-1'), recaptured],
    });
    const sig = imagebuttons(renderer).find(t => t.props.accessibilityLabel === 'View customer signature');
    await act(async () => {
      sig!.props.onPress();
    });
    expect(texts(renderer)).toContain('Customer signature');
    expect(
      renderer.root.findAll(t => t.props.source?.uri === 'https://r2.example.com/sig-2', {
        deep: true,
      }).length,
    ).toBeGreaterThan(0);
  });

  it('null-url photos stay placeholders — excluded from the numbering', async () => {
    const renderer = await render({ attachments: [photo('p1', null), photo('p2'), signature()] });
    const labels = imagebuttons(renderer).map(t => t.props.accessibilityLabel);
    expect(labels).toEqual(['View photo 1 of 2', 'View customer signature']);
  });

  it('closing the viewer unmounts it (grid-owned session, after the exit fade)', async () => {
    jest.useFakeTimers();
    try {
      const renderer = await render({ attachments: [photo('p1')] });
      const tile = imagebuttons(renderer)[0];
      await act(async () => {
        tile.props.onPress();
      });
      expect(renderer.root.findAll(t => t.props.accessibilityLabel === 'Close', { deep: true }).length).toBeGreaterThan(0);
      const close = renderer.root.find(t => t.props.accessibilityLabel === 'Close');
      await act(async () => {
        close.props.onPress();
      });
      // The session is held through the Modal's exit fade before release.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(renderer.root.findAll(t => t.props.accessibilityLabel === 'Close', { deep: true })).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('without a captured signature the row renders no signature imagebutton', async () => {
    const renderer = await render({ attachments: [photo('p1', null)] });
    expect(imagebuttons(renderer)).toHaveLength(0);
    expect(texts(renderer)).toContain('Tap refresh');
  });
});
