/**
 * Tests for the DS `Skeleton` (Story 19-4 D2, UX-DR5): the ReportSkeleton
 * anatomy moved verbatim — each row is an 80px block pulsing in a
 * 0.8s loop. The requirements this pins:
 *  - `rows` default 3, custom N renders N rows (the monthly view and the
 *    self view reuse the same primitive with different row counts);
 *  - the pulse is a REAL loop (not a one-shot animation, not a static
 *    opacity — a frozen skeleton reads as "failed", a stopped one as
 *    "stuck");
 *  - rows are `borderSubtle` (never a status hue — "content is coming",
 *    not "content is fine") and are NOT pressable.
 *
 * react-test-renderer has no automatic cleanup, so every renderer is
 * tracked and unmounted in afterEach — a live pulse still scheduling
 * animation frames after teardown crashes the Jest worker.
 */
jest.spyOn(Animated, 'loop');

import type ReactTestRendererType from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Animated } from 'react-native';
import { Skeleton } from './Skeleton';
import { colors } from '../../theme';

const mountedRenderers: ReactTestRendererType.ReactTestRenderer[] = [];

function renderSkeleton(rows?: number, height?: number) {
  let renderer!: ReactTestRendererType.ReactTestRenderer;
  act(() => {
    renderer = create(<Skeleton {...(rows === undefined ? {} : { rows })} {...(height === undefined ? {} : { height })} />);
  });
  mountedRenderers.push(renderer);
  return renderer;
}

/** The Animated.View mirrors render behind RTR's host tree — and since
 *  the sheen sweep the row ALSO hosts a sheen Animated.View child. Rows
 *  are the ones whose style carries the pulse's Animated opacity. */
function findPulseRows(renderer: ReactTestRendererType.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Animated.View as never)
    .filter(n => {
      const style = Array.isArray(n.props.style) ? n.props.style : [n.props.style];
      return style.some(s => s && typeof s === 'object' && s.opacity !== undefined);
    });
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(r => r.unmount());
  });
  mountedRenderers.length = 0;
  jest.clearAllMocks();
});

describe('Skeleton', () => {
  it('renders three pulsing rows by default', () => {
    expect(findPulseRows(renderSkeleton())).toHaveLength(3);
  });

  it('renders N rows for a custom `rows` (one, many)', () => {
    expect(findPulseRows(renderSkeleton(1))).toHaveLength(1);
    expect(findPulseRows(renderSkeleton(6))).toHaveLength(6);
  });

  it('a custom `height` reshapes the rows (the tile-shaped placeholder), default stays 80', () => {
    const renderer = renderSkeleton(1, 158);
    const flat = Object.assign(
      {},
      ...(Array.isArray(findPulseRows(renderer)[0].props.style)
        ? findPulseRows(renderer)[0].props.style
        : [findPulseRows(renderer)[0].props.style]),
    ) as { height?: number };
    expect(flat.height).toBe(158);
  });

  it('renders nothing for zero rows (a caller that wants just the gap)', () => {
    expect(findPulseRows(renderSkeleton(0))).toHaveLength(0);
  });

  it('pulses AND sweeps: every row starts TWO looping animations', () => {
    renderSkeleton(4);
    // Each row's effects start exactly TWO loops: the verbatim fade pulse
    // and the redesign's sheen sweep (a one-shot or a lost sweep would
    // NOT route through Animated.loop — this assertion is what catches
    // either). 4 rows × 2 = 8.
    expect(Animated.loop).toHaveBeenCalledTimes(8);
  });

  it('single-row callers still get both loops (the tile-shaped placeholder)', () => {
    renderSkeleton(1, 158);
    expect(Animated.loop).toHaveBeenCalledTimes(2);
  });

  it('each row sweeps a translucent sheen bar — and NEVER a status hue', () => {
    const renderer = renderSkeleton(3);
    const sheens = renderer.root.findAllByType(Animated.View as never).filter(
      n => n.props.backgroundColor === colors.shimmerSheen ||
        (Array.isArray(n.props.style) &&
          n.props.style.some?.(
            s => s && typeof s === 'object' && s.backgroundColor === colors.shimmerSheen,
          )),
    );
    expect(sheens).toHaveLength(3);
  });

  it('each row is an 80px borderSubtle block (the verbatim anatomy)', () => {
    for (const row of findPulseRows(renderSkeleton())) {
      const flat = Object.assign(
        {},
        ...(Array.isArray(row.props.style) ? row.props.style : [row.props.style]),
      ) as {
        height?: number;
        borderRadius?: number;
        backgroundColor?: string;
        opacity?: unknown;
      };
      expect(flat.height).toBe(80);
      expect(flat.borderRadius).toBe(8);
      expect(flat.backgroundColor).toBe(colors.borderSubtle);
      // The Animated.Value carries the pulse — a live number between 0
      // and 1 (under the mock it surfaces via toJSON; a plain number on
      // a non-animated render). Whatever the shape, it must be > 0: a
      // zero-opacity row renders invisible.
      const rawOpacity = flat.opacity;
      const opacityValue =
        typeof rawOpacity === 'number'
          ? rawOpacity
          : Number(JSON.parse(JSON.stringify(rawOpacity)));
      expect(opacityValue).toBeGreaterThan(0);
    }
  });

  it('rows are plain blocks — no press handling anywhere in the subtree', () => {
    const pressables = renderSkeleton().root.findAll(
      node =>
        typeof node.props.onPress === 'function' ||
        node.props.accessibilityRole === 'button',
    );
    expect(pressables).toHaveLength(0);
  });

  it('rows carry no a11y label (the skeleton is chrome, not content)', () => {
    const labelled = renderSkeleton().root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.length > 0,
    );
    expect(labelled).toHaveLength(0);
  });
});
