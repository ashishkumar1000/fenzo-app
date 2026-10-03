/**
 * PresentCard per-component tests (Story 19-4, BMAD review
 * verification-gap): the card clamps ITS display to 0–100 while the model
 * deliberately exposes an unclamped share — a drifted envelope can never
 * read as "200% workforce present today" in the bar, the caption, or the
 * accessibility label.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { PresentCard } from './PresentCard';

function render(pct: number) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<PresentCard pct={pct} width={320} />);
  });
  return renderer;
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

/** The progressbar View's a11y label — one carrier of the shown share.
 *  The role filter is required: the composite mirrors the label onto a
 *  host View too, so a label match alone is ambiguous (the house idiom). */
function a11yLabel(renderer: ReactTestRenderer.ReactTestRenderer): string {
  const nodes = renderer.root.findAll(
    node => node.props.accessibilityRole === 'progressbar' &&
      typeof node.props.accessibilityLabel === 'string',
  );
  expect(nodes.length).toBeGreaterThanOrEqual(1);
  // Every carrier (host mirrors included) carries the SAME full label.
  const label = nodes[0].props.accessibilityLabel as string;
  for (const n of nodes) expect(n.props.accessibilityLabel).toBe(label);
  return label;
}

describe('PresentCard', () => {
  it('renders the share in the bar, caption, and a11y label', () => {
    const rendered = render(60);
    const shown = textContents(rendered);
    expect(shown).toContain('60% workforce present today');
    expect(a11yLabel(rendered)).toBe('Updates automatically: 60% workforce present today');
  });

  it('CLAMPS an over-100 drifted share to 100 everywhere it is shown', () => {
    const rendered = render(200);
    expect(textContents(rendered)).toContain('100% workforce present today');
    expect(a11yLabel(rendered)).toBe('Updates automatically: 100% workforce present today');
    expect(textContents(rendered).some(t => t.includes('200%'))).toBe(false);
  });

  it('CLAMPS a negative drifted share to 0 everywhere it is shown', () => {
    const rendered = render(-20);
    expect(textContents(rendered)).toContain('0% workforce present today');
    expect(a11yLabel(rendered)).toBe('Updates automatically: 0% workforce present today');
  });
});