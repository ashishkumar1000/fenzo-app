/**
 * Tests for InlineNotice (Story 15-6):
 *  - Renders the message inside an accessibilityRole="alert" container.
 *  - Each tone maps to its own background/border (info=amber, success=green,
 *    neutral=muted). InlineError is red-only; InlineNotice covers the
 *    non-error amber/green/muted bands.
 *  - The optional dismiss button renders only when `onDismiss` is provided
 *    and fires `onDismiss` on tap.
 */
import type ReactTestRenderer from 'react-test-renderer';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { InlineNotice } from './InlineNotice';
import { colors } from '../../theme';

function renderNotice(
  props: React.ComponentProps<typeof InlineNotice>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<InlineNotice {...props} />);
  });
  return renderer;
}

function alertContainer(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'alert' });
}

function messageText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return alertContainer(renderer).findByType(Text);
}

/** Resolve nested style arrays to a flat object so we can read bg/border. */
function flatStyle(node: { props: { style?: StyleProp<ViewStyle> } }) {
  return StyleSheet.flatten(node.props.style) as Record<string, unknown> | null;
}

/** The IconButton wraps a Pressable with `accessibilityLabel="Dismiss"`. */
function findDismissButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: 'Dismiss',
  });
}

describe('InlineNotice', () => {
  it('renders the message in an alert container', () => {
    const renderer = renderNotice({ message: 'Saved' });
    expect(messageText(renderer).props.children).toBe('Saved');
    expect(alertContainer(renderer)).toBeDefined();
  });

  it('no dismiss button when onDismiss is omitted', () => {
    const renderer = renderNotice({ message: 'Info' });
    expect(() => findDismissButton(renderer)).toThrow();
  });

  it('renders a dismiss button when onDismiss is given; tapping it fires the handler', () => {
    const onDismiss = jest.fn();
    const renderer = renderNotice({ message: 'Saved', tone: 'success', onDismiss });
    const btn = findDismissButton(renderer);
    expect(btn).toBeDefined();

    act(() => {
      btn.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('info tone uses the scheduled (amber) palette', () => {
    const renderer = renderNotice({ message: 'i', tone: 'info' });
    const style = flatStyle(alertContainer(renderer)) as Record<string, string>;
    expect(style.backgroundColor).toBe(colors.status.scheduled.bg);
    expect(style.borderColor).toBe(colors.status.scheduled.border);
  });

  it('success tone uses the done (green) palette', () => {
    const renderer = renderNotice({ message: 's', tone: 'success' });
    const style = flatStyle(alertContainer(renderer)) as Record<string, string>;
    expect(style.backgroundColor).toBe(colors.status.done.bg);
    expect(style.borderColor).toBe(colors.status.done.border);
  });

  it('neutral tone uses the surfaceSunken + borderSubtle palette', () => {
    const renderer = renderNotice({ message: 'n', tone: 'neutral' });
    const style = flatStyle(alertContainer(renderer)) as Record<string, string>;
    expect(style.backgroundColor).toBe(colors.surfaceSunken);
    expect(style.borderColor).toBe(colors.borderSubtle);
  });

  it('the three tones use distinct backgrounds (no palette drift)', () => {
    const info = renderNotice({ message: 'i', tone: 'info' });
    const success = renderNotice({ message: 's', tone: 'success' });
    const neutral = renderNotice({ message: 'n', tone: 'neutral' });
    const infoBg = flatStyle(alertContainer(info))?.backgroundColor as string;
    const successBg = flatStyle(alertContainer(success))?.backgroundColor as string;
    const neutralBg = flatStyle(alertContainer(neutral))?.backgroundColor as string;
    expect(new Set([infoBg, successBg, neutralBg]).size).toBe(3);
  });
});
