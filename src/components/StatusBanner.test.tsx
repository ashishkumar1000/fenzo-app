/**
 * StatusBanner — presentation probe for the redesigned bottom toast
 * (2026-09-09): alert role, accessibility label, box-none tap-through (the
 * overlay must never swallow touches on the UI beneath it), the anchor just
 * above the tab bar, the on-color (brand-blue) card, per-field rendering
 * (missing fields dropped), and the degraded all-fields-missing line.
 * Insets are stubbed; theme tokens real.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { colors, layout, spacing } from '../theme';
import { StatusBanner } from './StatusBanner';
import type { OwnerNotificationBanner } from '../features/notifications/useOwnerNotifications';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const FULL: OwnerNotificationBanner = {
  text: 'Priya · JOB-1042 · On my way',
  technicianName: 'Priya',
  jobNumber: 'JOB-1042',
  stepLabel: 'On my way',
  stepStatus: 'progress',
};

function render(
  banner: OwnerNotificationBanner | null,
): ReactTestRenderer.ReactTestRenderer {
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

  it('renders as an alert overlay that taps through (box-none), anchored above the tab bar', () => {
    const renderer = render(FULL);
    expect(renderer.toJSON()).not.toBeNull();

    // Touch-through: only the banner's own content is hit-testable, never
    // the full-width rectangle between the insets.
    const overlay = renderer.root.findByProps({ pointerEvents: 'box-none' });
    const bottomStyle = (overlay.props.style as Array<{ bottom?: number }>).find(
      s => typeof s.bottom === 'number',
    );
    expect(bottomStyle?.bottom).toBe(34 + layout.bottomNavH + spacing.s2);

    // The card is the single accessibility element: role alert with the
    // composed line as its label (no fragment re-reads), plus the Android
    // live-region announcement path.
    const card = renderer.root.findByProps({ accessibilityRole: 'alert' });
    expect(card.props.accessibilityLabel).toBe(FULL.text);
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLiveRegion).toBe('polite');
  });

  it('renders the name, job chip, and step chip from the structured parts', () => {
    const renderer = render(FULL);
    expect(renderer.root.findByProps({ children: 'Priya' })).toBeDefined();
    expect(renderer.root.findByProps({ children: 'JOB-1042' })).toBeDefined();
    expect(renderer.root.findByProps({ children: 'On my way' })).toBeDefined();
  });

  it('wires the step status into the chips (Badge status + avatar dot color)', () => {
    // 'done' green is a unique color value — progress blue equals the card
    // blue, so a dot assertion on it could pass via the card itself.
    const done: OwnerNotificationBanner = {
      ...FULL,
      stepLabel: 'Completed',
      stepStatus: 'done',
    };
    const renderer = render(done);
    // The step Badge carries the raw StatusKey through to the DS component.
    const stepBadge = renderer.root.findAllByProps({ dot: true, size: 'sm' });
    expect(stepBadge.some(node => node.props.status === 'done')).toBe(true);
    // The avatar's status dot is filled with the same status color (the
    // dot's style is an array — flatten before reading the background).
    const dots = renderer.root.findAll(node => {
      if (typeof node.type !== 'string') return false;
      const style = node.props?.style;
      const bg = Array.isArray(style)
        ? style.find(s => s?.backgroundColor)?.backgroundColor
        : style?.backgroundColor;
      return bg === colors.status.done.solid;
    });
    expect(dots.length).toBeGreaterThan(0);
  });

  it('renders the on-color card (brand blue, so it never blends with white cards beneath)', () => {
    const renderer = render(FULL);
    const card = renderer.root.findByProps({ testID: 'status-banner-card' });
    expect(card.props.style.backgroundColor).toBe(colors.primary);
  });

  it('drops the fields the event payload lacked (per-field rendering)', () => {
    const partial: OwnerNotificationBanner = {
      text: 'Priya · On my way',
      technicianName: 'Priya',
      jobNumber: null,
      stepLabel: 'On my way',
      stepStatus: 'progress',
    };
    const renderer = render(partial);
    expect(renderer.root.findByProps({ children: 'Priya' })).toBeDefined();
    expect(renderer.root.findByProps({ children: 'On my way' })).toBeDefined();
    // No job chip anywhere.
    expect(renderer.root.findAllByProps({ children: 'JOB-1042' })).toHaveLength(0);
  });

  it('renders the fallback line alone when every field is missing', () => {
    const degraded: OwnerNotificationBanner = {
      text: 'Job status updated',
      technicianName: null,
      jobNumber: null,
      stepLabel: null,
      stepStatus: 'neutral',
    };
    const renderer = render(degraded);
    expect(renderer.root.findByProps({ children: 'Job status updated' })).toBeDefined();
    // Degraded = the generic line ONLY — no avatar, no chips.
    expect(renderer.root.findAllByType(Avatar)).toHaveLength(0);
    expect(renderer.root.findAllByType(Badge)).toHaveLength(0);
  });
});