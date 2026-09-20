/**
 * Render/selection tests for the CustomerPicker tile grid — the New Job
 * customer section mirroring the SkillPicker pattern (product feedback
 * 2026-09-20, story 11-7):
 *
 * - header row: customer count chip ("N customers") and a "Browse all" link
 *   that fires `onBrowseAll`;
 * - a 3-column grid whose idle state is the FIRST TWO customers in recency
 *   order (`sortCustomersByRecency` — most recent `lastJobDate` first, name
 *   as the tiebreak) plus a "+N More customers" tile that also fires
 *   `onBrowseAll` — 2 tiles + the more tile fill exactly one complete row
 *   (COLUMNS = 3);
 * - a search field that, when non-empty, searches the WHOLE store (name or
 *   phone digits, via `filterCustomers`) and shows a no-match message;
 * - a tap fires `onChange` with the customer's id; the selected tile is
 *   marked via `accessibilityState`.
 *
 * Selection × cap × search: a selection made outside the first two is
 * pinned onto the idle grid (still exactly two tiles), and a search that
 * matches the selection keeps it visible.
 *
 * Presentational only — the parent owns the option list. The real
 * `filterCustomers` / `sortCustomersByRecency` / `Avatar` run here (they
 * have their own coverage); tile internals beyond selection state and labels
 * are not asserted.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { CustomerPicker } from './CustomerPicker';
import type { Customer } from '../../customers';

const make = (overrides: Partial<Customer>): Customer => ({
  id: 'c-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000002',
  address: null,
  city: null,
  jobCount: 0,
  lastJobDate: null,
  ...overrides,
});

const CUSTOMERS: Customer[] = [
  make({ id: 'c-1', name: 'Ravi Kumar' }),
  make({ id: 'c-2', name: 'Anita Sharma' }),
  make({ id: 'c-3', name: 'Gopal Menon' }),
];

/** Seven rows so the two-tile cap and the "+N more" tile both engage. */
const SEVEN: Customer[] = [
  ...CUSTOMERS,
  make({ id: 'c-4', name: 'Divya Iyer', lastJobDate: '2026-09-19T10:00:00Z' }),
  make({ id: 'c-5', name: 'Bala Singh', lastJobDate: '2026-09-18T10:00:00Z' }),
  make({ id: 'c-6', name: 'Meera Nair', lastJobDate: '2026-09-17T10:00:00Z' }),
  make({ id: 'c-7', name: 'Zoya Khan', lastJobDate: '2026-09-16T10:00:00Z' }),
];

function renderPicker(
  value: string | null,
  onChange: (id: string) => void,
  onBrowseAll: () => void = () => {},
  options: Customer[] = CUSTOMERS,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <CustomerPicker
        options={options}
        value={value}
        onChange={onChange}
        onBrowseAll={onBrowseAll}
      />,
    );
  });
  return renderer.root;
}

/**
 * The tile Pressables only — `accessibilityRole: 'button'` also matches
 * hosts Pressable renders internally (no onPress), the header's Browse-all
 * link and the "+N more" tile, none of which carry an
 * `accessibilityState`.
 */
function tiles(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(
      t =>
        typeof t.props.onPress === 'function' &&
        t.props.accessibilityState !== undefined,
    );
}

/** Joins a Text node's children — JSX interpolation yields arrays. */
function nodeText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

function tileLabels(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => nodeText(t.props.children));
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return tileLabels(root).some(label => label === text);
}

function typeIntoSearch(
  root: ReactTestRenderer.ReactTestInstance,
  text: string,
) {
  const input = root.findAllByType(TextInput)[0];
  act(() => {
    input.props.onChangeText(text);
  });
}

function pressLabelled(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const target = root.findAllByProps({ accessibilityLabel: label })[0];
  act(() => {
    target.props.onPress();
  });
}

it('renders the recency-ordered tiles, with the name as the label', () => {
  const root = renderPicker(null, () => {});
  const labels = tileLabels(root);
  // All three rows have no lastJobDate, so the idle grid is name-ordered:
  // Anita, Gopal — and the idle grid caps at two tiles, so Ravi sits behind
  // the "+N more" tile.
  expect(labels).toContain('Anita Sharma');
  expect(labels).toContain('Gopal Menon');
  expect(labels).not.toContain('Ravi Kumar');
  expect(labels).toContain('+1');
  expect(labels).toContain('More customers');
});

it('marks the selected customer via accessibilityState', () => {
  // All three rows have no lastJobDate, so the idle grid is name-ordered:
  // Anita, Gopal (Ravi is capped out).
  const root = renderPicker('c-2', () => {});
  expect(tiles(root).map(t => t.props.accessibilityState)).toEqual([
    { selected: true },
    { selected: false },
  ]);
});

it('fires onChange with the tapped customer id', () => {
  const onChange = jest.fn();
  const root = renderPicker(null, onChange);
  const t = tiles(root);
  act(() => {
    t[1].props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('c-3'); // Gopal Menon — name-ordered second
});

it('shows the count chip and fires onBrowseAll from the Browse all link', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll);

  expect(hasText(root, '3 customers')).toBe(true);

  pressLabelled(root, 'Browse all customers');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('singularises the count chip for a single customer', () => {
  const root = renderPicker(null, () => {}, () => {}, [CUSTOMERS[0]]);

  expect(hasText(root, '1 customer')).toBe(true);
  expect(hasText(root, '1 customers')).toBe(false);
});

it('caps the idle grid at two tiles, recency-ordered, and routes the rest through the "+N More customers" tile', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll, SEVEN);

  const labels = tileLabels(root);
  // Recency order: the four customers with jobs come first (Divya → Bala →
  // Meera → Zoya by lastJobDate desc), then the no-job rows by name (Anita,
  // Gopal, Ravi). The idle grid keeps only the first two — Divya and Bala;
  // everyone else is reachable via the more tile.
  expect(labels).toContain('Divya Iyer');
  expect(labels).toContain('Bala Singh');
  expect(labels).not.toContain('Meera Nair');
  expect(labels).not.toContain('Zoya Khan');
  expect(labels).not.toContain('Anita Sharma');
  expect(labels).toContain('+5');
  expect(labels).toContain('More customers');

  pressLabelled(root, 'More customers — 5 more available');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('shows no "+N more" tile while a search is active', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');
  expect(tileLabels(root)).not.toContain('More customers');
  expect(tileLabels(root)).toContain('Zoya Khan');
});

it('searches the whole store, not just the first five rows', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');
  const labels = tileLabels(root);
  expect(labels).toContain('Zoya Khan');
  expect(labels).not.toContain('Ravi Kumar');
});

it('matches on phone digits too, and says so when nothing fits', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);

  typeIntoSearch(root, '9000');
  expect(tileLabels(root)).toContain('Ravi Kumar');

  typeIntoSearch(root, 'zzz-no-such-customer');
  expect(tileLabels(root)).not.toContain('Ravi Kumar');
  expect(
    tileLabels(root).some(label => label.includes('No customers match')),
  ).toBe(true);
});

it('pins a selection made beyond the first two onto the idle grid', () => {
  // Chosen via "Browse all" or a search, the selection would otherwise be
  // invisible on the default surface — the section would show no answer to
  // "who is this job for?".
  const root = renderPicker('c-7', () => {}, () => {}, SEVEN);
  const labels = tileLabels(root);

  expect(labels).toContain('Zoya Khan');
  expect(labels).not.toContain('Bala Singh'); // the displaced second tile
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
  // Still exactly two tiles — the pin replaces, never adds a third.
  expect(tiles(root)).toHaveLength(2);
});

it('re-fires onChange with the same id when the selected tile is tapped', () => {
  // Tapping the current selection must stay a plain id change — the parent
  // owns any no-op handling, not the picker.
  const onChange = jest.fn();
  const root = renderPicker('c-2', onChange);
  const selected = tiles(root).find(t => t.props.accessibilityState.selected);

  act(() => {
    selected?.props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('c-2');
});

it('keeps the selection visible when a search matches it', () => {
  const root = renderPicker('c-7', () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');

  expect(tileLabels(root)).toContain('Zoya Khan');
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
});
