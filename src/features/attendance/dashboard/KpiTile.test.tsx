/**
 * KpiTile per-component tests (Story 19-4, BMAD review verification-gap):
 * the tiles are ANSWERS, not drill-downs — they must never be pressable,
 * the percent pill appears ONLY on the checked-in tile (it is the checked-
 * in share, no other tile has a denominator), and the tracked tile alone
 * carries the coloured accent render (its sheens are decoration).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { KpiTile } from './KpiTile';
import type { KpiTileSpec } from './dashboardModel';

function tile(overrides: Partial<KpiTileSpec> & Pick<KpiTileSpec, 'key' | 'label' | 'value' | 'a11yLabel'>): KpiTileSpec {
  return { pct: null, ...overrides };
}

function render(t: KpiTileSpec) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<KpiTile tile={t} width={160} />);
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

describe('KpiTile', () => {
  it('renders the count over the label and carries the a11y pairing', () => {
    const rendered = render(tile({ key: 'tracked', label: 'Tracked', value: 5, a11yLabel: 'Tracked: 5' }));
    const shown = textContents(rendered);
    expect(shown).toContain('5');
    expect(shown).toContain('Tracked');
    // The pairing lives on the subtree root's label.
    expect(rendered.root.props.accessibilityLabel).toBeUndefined();
    const carriers = rendered.root.findAll(
      node => node.props.accessibilityLabel === 'Tracked: 5',
    );
    expect(carriers.length).toBeGreaterThanOrEqual(1);
  });

  it('is NON-interactive: no button role, no pressable subtree, no handlers', () => {
    const keys = ['tracked', 'checkedIn', 'notCheckedIn', 'late', 'onLeave'] as const;
    for (const key of keys) {
      const rendered = render(tile({ key, label: 'X', value: 1, a11yLabel: 'X: 1' }));
      const pressables = rendered.root.findAll(
        node =>
          node.props.accessibilityRole === 'button' ||
          typeof node.props.onPress === 'function',
      );
      expect(pressables).toHaveLength(0);
    }
  });

  it('the pct pill appears ONLY when pct is set (the checked-in tile)', () => {
    const withPct = textContents(render(tile({
      key: 'checkedIn', label: 'Checked in', value: 3, pct: 60, a11yLabel: 'Checked in: 3',
    })));
    expect(withPct).toContain('60%');
    const withoutPct = textContents(render(tile({
      key: 'late', label: 'Late', value: 1, a11yLabel: 'Late: 1',
    })));
    expect(withoutPct.some(t => t.includes('%'))).toBe(false);
  });
});