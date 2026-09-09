/**
 * StatusBanner — the presentation probe the bridge suite's header points at
 * (review gap fix, 2026-09-09): alert role, banner text, box-none
 * tap-through (the overlay must never swallow touches on the UI beneath it),
 * and the null passthrough. Insets and the icon are stubbed; theme tokens
 * are real.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { spacing } from '../theme';
import { StatusBanner } from './StatusBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lucide-react-native', () => ({ Bell: () => null }));

const BANNER = { text: 'Priya · JOB-1042 · On my way' };

function render(banner: typeof BANNER | null): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(StatusBanner, { banner }));
  });
  return renderer;
}

describe('StatusBanner', () => {
  it('renders nothing without a banner', () => {
    expect(render(null).toJSON()).toBeNull();
  });

  it('renders the banner line as an alert overlay that taps through (box-none)', () => {
    const renderer = render(BANNER);
    expect(renderer.toJSON()).not.toBeNull();

    const overlay = renderer.root.findByProps({ accessibilityRole: 'alert' });
    expect(overlay.props.accessibilityLabel).toBe(BANNER.text);
    // Touch-through: only the banner's own content is hit-testable, never
    // the full-width rectangle between the insets.
    expect(overlay.props.pointerEvents).toBe('box-none');

    // Anchored below the status bar (inset 47 + spacing.s2).
    const topStyle = (overlay.props.style as Array<{ top?: number }>).find(
      s => typeof s.top === 'number',
    );
    expect(topStyle?.top).toBe(47 + spacing.s2);
  });

  it('renders the banner text', () => {
    const renderer = render(BANNER);
    expect(renderer.root.findByProps({ children: BANNER.text })).toBeDefined();
  });
});