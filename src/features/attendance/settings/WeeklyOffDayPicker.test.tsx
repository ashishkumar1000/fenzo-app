/**
 * Tests for WeeklyOffDayPicker (Story 15-6):
 *  - Renders all 7 pills in Mon..Sun order with the visible glyph map.
 *  - Accessibility: each pill is a CHECKBOX in a labelled group (15-6
 *    review — the control is genuinely multi-select, so radio semantics
 *    announced single-select). The label is the FULL weekday name (so the
 *    two S's and two T's never share one), and the selected state is
 *    carried by `accessibilityState.checked`.
 *  - Tap toggles a day on/off and the onChange payload is sorted ascending
 *    (the wire format stays deterministic for diffs).
 *  - `disabled` swallows every tap (the parent's in-flight Save path).
 *
 * Note on locating pills: two of the seven glyphs repeat (T = Tue/Thu,
 * S = Sat/Sun), so a lookup *by letter* is ambiguous — resolve pills
 * positionally instead. The row renders `WEEKLY_OFF_DAY_ORDER.map(...)`,
 * so the n-th single-glyph Text in tree order belongs to the n-th day.
 * From that Text we walk up to the nearest ancestor carrying `onPress`,
 * which is the pill's Pressable (the group wrapper has no `onPress`).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useState } from 'react';
import { Text } from 'react-native';
import { WeeklyOffDayPicker, weeklyOffDayName, WEEKLY_OFF_DAY_LETTERS, WEEKLY_OFF_DAY_ORDER } from './WeeklyOffDayPicker';
import type { IsoWeekday } from '../../../services';

function renderPicker(props: React.ComponentProps<typeof WeeklyOffDayPicker>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<WeeklyOffDayPicker {...props} />);
  });
  return renderer;
}

/** The pill Pressable enclosing a given node (the nearest `onPress` ancestor). */
function findPressableAncestor(
  node: ReactTestRenderer.ReactTestInstance,
): ReactTestRenderer.ReactTestInstance {
  let cur: ReactTestRenderer.ReactTestInstance | null = node.parent;
  while (cur) {
    if (typeof cur.props.onPress === 'function') return cur;
    cur = cur.parent;
  }
  throw new Error('No Pressable ancestor for the pill glyph');
}

/**
 * All 7 pills in row order (Mon=1 .. Sun=7).
 *
 * Positional, not by-letter: `root.findAll` walks the tree depth-first, so
 * the n-th single-glyph Text matches `WEEKLY_OFF_DAY_ORDER[n]`.
 */
function findPills(
  root: ReactTestRenderer.ReactTestInstance,
): ReactTestRenderer.ReactTestInstance[] {
  const glyphs = root.findAll(
    (n) =>
      n.type === Text &&
      typeof n.props.children === 'string' &&
      Object.values(WEEKLY_OFF_DAY_LETTERS).includes(n.props.children),
  );
  // Exactly one Text per pill — no host-wrapper duplicates for Text here.
  expect(glyphs).toHaveLength(WEEKLY_OFF_DAY_ORDER.length);
  return glyphs.map(findPressableAncestor);
}

function findPillByDay(
  root: ReactTestRenderer.ReactTestInstance,
  day: IsoWeekday,
): ReactTestRenderer.ReactTestInstance {
  const index = WEEKLY_OFF_DAY_ORDER.indexOf(day);
  expect(index).toBeGreaterThanOrEqual(0);
  return findPills(root)[index];
}

describe('WeeklyOffDayPicker', () => {
  it('renders 7 pills in Mon..Sun order with the documented glyph map', () => {
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    const found = findPills(root).map((pill) => {
      const glyph = pill.findAll(
        (n) => n.type === Text && typeof n.props.children === 'string',
      );
      // The pill renders exactly one Text node — its letter.
      expect(glyph).toHaveLength(1);
      return glyph[0].props.children as string;
    });
    const letters = WEEKLY_OFF_DAY_ORDER.map((d) => WEEKLY_OFF_DAY_LETTERS[d]);
    expect(found).toEqual(letters);
    expect(found).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('every pill carries accessibilityRole="checkbox" (multi-select)', () => {
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    for (const day of WEEKLY_OFF_DAY_ORDER) {
      expect(findPillByDay(root, day).props.accessibilityRole).toBe('checkbox');
    }
  });

  it('every pill has a FULL day-name a11y label; state carries checked=false', () => {
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    for (const day of WEEKLY_OFF_DAY_ORDER) {
      const pill = findPillByDay(root, day);
      // The bare day name: the state is announced through
      // accessibilityState.checked, not baked into the label.
      expect(pill.props.accessibilityLabel).toMatch(/^[A-Z][a-z]+day$/);
      expect(pill.props.accessibilityState).toEqual({ checked: false });
    }
  });

  it('a selected pill announces checked=true (the state, not the label)', () => {
    const root = renderPicker({ value: [1, 7], onChange: jest.fn() }).root;
    expect(findPillByDay(root, 1).props.accessibilityLabel).toBe('Monday');
    expect(findPillByDay(root, 1).props.accessibilityState).toEqual({ checked: true });
    expect(findPillByDay(root, 7).props.accessibilityLabel).toBe('Sunday');
    expect(findPillByDay(root, 7).props.accessibilityState).toEqual({ checked: true });
    // An unselected mid-week day stays unchecked.
    expect(findPillByDay(root, 3).props.accessibilityLabel).toBe('Wednesday');
    expect(findPillByDay(root, 3).props.accessibilityState).toEqual({ checked: false });
  });

  it('the two S\'s (Sat=6, Sun=7) and two T\'s (Tue=2, Thu=4) have distinct labels', () => {
    // The UX-DR floor — without distinct labels, a screen reader user
    // cannot tell the two S/T pills apart. This is exactly why the pills
    // are looked up positionally: by-letter lookup cannot separate them.
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    const tue = findPillByDay(root, 2).props.accessibilityLabel as string;
    const thu = findPillByDay(root, 4).props.accessibilityLabel as string;
    const sat = findPillByDay(root, 6).props.accessibilityLabel as string;
    const sun = findPillByDay(root, 7).props.accessibilityLabel as string;
    expect(tue).not.toBe(thu);
    expect(sat).not.toBe(sun);
    expect(tue).toMatch(/^Tuesday/);
    expect(thu).toMatch(/^Thursday/);
    expect(sat).toMatch(/^Saturday/);
    expect(sun).toMatch(/^Sunday/);
    // The visible glyphs DO collide — a11y labels are the only separator.
    expect(findPillByDay(root, 2).props.accessibilityLabel)
      .not.toBe(findPillByDay(root, 4).props.accessibilityLabel);
  });

  it('a tap on an unselected day fires onChange with the day added (sorted)', () => {
    const onChange = jest.fn();
    const root = renderPicker({ value: [7], onChange }).root;
    act(() => {
      findPillByDay(root, 2).props.onPress();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([2, 7]); // sorted ascending
  });

  it('a tap on a selected day fires onChange with the day removed', () => {
    const onChange = jest.fn();
    const root = renderPicker({ value: [2, 7], onChange }).root;
    act(() => {
      findPillByDay(root, 2).props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith([7]);
  });

  it('onChange is always sorted ascending regardless of tap order', () => {
    // The picker is CONTROLLED — it derives the next value from its
    // `value` prop, so a bare spy would see every tap computed from the
    // same stale prop. Drive it through a stateful harness that feeds the
    // emitted value straight back in, which is how the screens use it.
    const seen: IsoWeekday[][] = [];
    function Harness() {
      const [value, setValue] = useState<IsoWeekday[]>([1, 7]);
      return (
        <WeeklyOffDayPicker
          value={value}
          onChange={(next) => {
            seen.push(next);
            setValue(next);
          }}
        />
      );
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness />);
    });

    act(() => {
      findPillByDay(renderer.root, 5).props.onPress(); // tap Fri
    });
    expect(seen[seen.length - 1]).toEqual([1, 5, 7]);

    act(() => {
      findPillByDay(renderer.root, 3).props.onPress(); // tap Wed
    });
    expect(seen[seen.length - 1]).toEqual([1, 3, 5, 7]);

    act(() => {
      findPillByDay(renderer.root, 5).props.onPress(); // tap Fri again → remove
    });
    expect(seen[seen.length - 1]).toEqual([1, 3, 7]);

    // Every emitted payload is ascending — never the tap order.
    for (const payload of seen) {
      expect(payload).toEqual([...payload].sort((a, b) => a - b));
    }
    // And the rendered state tracked those emissions.
    expect(findPillByDay(renderer.root, 3).props.accessibilityState)
      .toEqual({ checked: true });
    expect(findPillByDay(renderer.root, 5).props.accessibilityState)
      .toEqual({ checked: false });
  });

  it('disabled: every pill is disabled and taps do not fire onChange', () => {
    const onChange = jest.fn();
    const root = renderPicker({ value: [1, 2, 3], onChange, disabled: true }).root;
    for (const day of WEEKLY_OFF_DAY_ORDER) {
      expect(findPillByDay(root, day).props.disabled).toBe(true);
    }
    act(() => {
      findPillByDay(root, 4).props.onPress();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the row is a labelled group so AT treats the pills as one widget', () => {
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    const view = root.findAll((n) => n.props.accessibilityRole === 'group');
    // One declared role=group (the View). The host wrappers around
    // each Pressable don't carry role — they're transparent from AT.
    expect(view.length).toBeGreaterThanOrEqual(1);
    expect(view[0].props.accessibilityRole).toBe('group');
    expect(view[0].props.accessibilityLabel).toBe('Days off');
  });

  it('day names are the UTC-anchored English weekday names, Mon..Sun', () => {
    // 15-6 review iteration 1: the names are produced by one hoisted
    // formatter pinned to timeZone UTC (the old per-pill device-zone
    // formatting announced "Sunday" for the Monday pill behind-UTC zones),
    // with the hardcoded English map as the Intl-less fallback. Pin the
    // exact words the pills announce.
    const expected = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    expect(WEEKLY_OFF_DAY_ORDER.map(weeklyOffDayName)).toEqual(expected);
    // The a11y labels on the pills come from the same source.
    const root = renderPicker({ value: [], onChange: jest.fn() }).root;
    WEEKLY_OFF_DAY_ORDER.forEach((day, i) => {
      expect(findPillByDay(root, day).props.accessibilityLabel).toBe(
        expected[i],
      );
    });
  });
});
