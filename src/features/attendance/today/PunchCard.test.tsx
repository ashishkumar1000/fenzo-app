/**
 * PunchCard's flag pills (20-1 review): late and early can LEGALLY
 * coexist — each takes its own pill (the header contract), and the old
 * `??` fold is the bug this pins: a fold would caption the LATE value
 * with early's before-shift line and drop one pill entirely.
 *
 * RTR house idioms; renderers unmounted at teardown.
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { Text } from 'react-native';
import { PunchCard } from './PunchCard';
import type { TodayTilesModel } from './attendanceTodayModel';

function tiles(overrides: Partial<TodayTilesModel> = {}): TodayTilesModel {
  return {
    checkinText: '9:04 AM',
    checkoutText: '6:02 PM',
    workedText: '8 h 58 m',
    lateText: null,
    earlyText: null,
    earlyBeforeShiftText: null,
    ...overrides,
  };
}

let lastRenderer: ReactTestRenderer | null = null;

function renderCard(model: TodayTilesModel) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<PunchCard tiles={model} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

afterEach(() => {
  if (lastRenderer) {
    const r = lastRenderer;
    lastRenderer = null;
    act(() => r.unmount());
  }
});

function strings(root: ReactTestInstance): string[] {
  return root.findAll((n) => n.type === Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')));
}

describe('the flag pills — late and early take SEPARATE pills', () => {
  it('late by itself: one pill carrying the value, NO before-shift caption', () => {
    const root = renderCard(tiles({ lateText: 'Late by 12 min' }));
    expect(strings(root)).toContain('Late by 12 min');
    expect(strings(root).filter((t) => t.includes('Late by'))).toHaveLength(1);
    // The caption would only repeat the value — it stays off.
    expect(strings(root).some((t) => t.includes('before shift'))).toBe(false);
  });

  it('early by itself: one pill with the value AND the before-shift caption', () => {
    const root = renderCard(
      tiles({ earlyText: 'Early by 10 min', earlyBeforeShiftText: '11 h 20 m before shift' }),
    );
    expect(strings(root)).toContain('Early by 10 min');
    expect(strings(root)).toContain('11 h 20 m before shift');
  });

  it('BOTH coexist: two pills — the early caption is grouped with the EARLY value, never the late one', () => {
    const root = renderCard(
      tiles({
        lateText: 'Late by 30 min',
        earlyText: 'Early by 45 min',
        earlyBeforeShiftText: '10 h 45 m before shift',
      }),
    );
    const s = strings(root);
    expect(s).toContain('Late by 30 min');
    expect(s).toContain('Early by 45 min');
    // Exactly one caption — the fold's single wrong caption is gone.
    expect(s.filter((t) => t.includes('before shift'))).toHaveLength(1);
    // Grouping: the caption's nearest View ancestor subtree contains the
    // EARLY value and NOT the late one (they are separate pill trees).
    const caption = root
      .findAll((n) => n.type === Text && n.props.children === '10 h 45 m before shift')[0];
    const hasValue = (node: ReactTestInstance): boolean =>
      node.findAll((m) => m.type === Text)
        .some((m) => String(m.props.children ?? '') === 'Early by 45 min');
    let pill: ReactTestInstance | null = caption.parent;
    while (pill != null && !hasValue(pill)) {
      pill = pill.parent;
    }
    expect(pill).not.toBeNull();
    expect(
      (pill ? pill.findAll((m) => m.type === Text) : [])
        .some((m) => String(m.props.children ?? '') === 'Late by 30 min'),
    ).toBe(false);
  });
});
