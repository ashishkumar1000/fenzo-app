/**
 * FlagStrip per-component tests (Story 19-4, BMAD review verification-gap):
 * the strip is TAPPABLE (the sheet affordance), the CRITICAL tag appears
 * ONLY when the caller says so (the fake-location strip alone is critical
 * — checkout-missing must read as an oversight, not an attack), and the
 * count badge mirrors the count the model computed.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { FlagStrip } from './FlagStrip';

const CHIP = { bg: '#eee', fg: '#333', solid: '#999' };

function render(critical?: boolean, count = 2) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const onPress = jest.fn();
  act(() => {
    renderer = create(
      <FlagStrip
        icon={null}
        label="Fake location attempt"
        detail="GPS spoofing blocked on 2 days."
        count={count}
        chip={CHIP}
        critical={critical}
        onPress={onPress}
        a11yLabel="Fake location attempt, 2 days"
      />,
    );
  });
  return { renderer, onPress };
}

function textContents(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The composite mirrors accessibility onto host Views — label + role + a
 *  real onPress is the only unambiguous match (the house idiom). */
function stripPress(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node => node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('FlagStrip', () => {
  it("renders as a button with the model's a11y label and fires onPress", () => {
    const { renderer, onPress } = render();
    const carries = stripPress(renderer);
    expect(carries.props.accessibilityRole).toBe('button');
    expect(carries.props.accessibilityLabel).toBe('Fake location attempt, 2 days');
    act(() => {
      carries.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL appears ONLY on the fake-location strip (critical=true)', () => {
    const fake = textContents(render(true).renderer);
    expect(fake).toContain('CRITICAL');
    const checkout = textContents(render(false).renderer);
    expect(checkout).not.toContain('CRITICAL');
  });

  it('shows the title, the one-line detail, and the count badge', () => {
    const shown = textContents(render(false, 3).renderer);
    expect(shown).toContain('Fake location attempt');
    expect(shown).toContain('GPS spoofing blocked on 2 days.');
    expect(shown).toContain('3');
  });
});