/**
 * Tests for the DS `Select` title contract: a field whose visible label is
 * carried by a section header (`sheetTitle` given, no `label`) still opens
 * an options sheet with a proper title — `sheetTitle` wins over `label`,
 * `label` is the fallback, and neither leaves the sheet untitled when both
 * are absent. `sheetTitle` also names the collapsed trigger for screen
 * readers when `label` is absent.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, Text } from 'react-native';
import { Select } from './Select';

const baseProps = {
  value: 'a',
  onChange: () => {},
  options: ['a', 'b'],
};

function renderSelect(props: Parameters<typeof Select>[0]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Select {...props} />);
  });
  return renderer;
}

/** The collapsed trigger's accessible name — the only one on the tree. */
function triggerAccessibilityLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
): string {
  return renderer.root.findByProps({ accessibilityRole: 'button' }).props
    .accessibilityLabel;
}

/** Opens the options sheet and returns the Text strings inside it. */
function openSheetAndGetTexts(
  renderer: ReactTestRenderer.ReactTestRenderer,
): string[] {
  act(() => {
    renderer.root
      .findByProps({ accessibilityRole: 'button' })
      .props.onPress();
  });
  // Scoped to the sheet's Modal — the closed field behind it also renders
  // the selected value, which must not leak into the title assertions.
  return renderer.root
    .findByType(Modal)
    .findAllByType(Text)
    .flatMap(t =>
      typeof t.props.children === 'string' ? [t.props.children] : [],
    );
}

it('uses sheetTitle for the options sheet when the field has no visible label', () => {
  const renderer = renderSelect({
    ...baseProps,
    sheetTitle: 'Pick a customer',
    placeholder: 'Choose customer…',
  });
  const texts = openSheetAndGetTexts(renderer);

  expect(texts).toContain('Pick a customer');
  expect(texts).not.toContain('Customer');
});

it('names the collapsed trigger with sheetTitle when label is absent', () => {
  const renderer = renderSelect({
    ...baseProps,
    sheetTitle: 'Customer',
    placeholder: 'Choose customer…',
  });

  expect(triggerAccessibilityLabel(renderer)).toBe('Customer');
});

it('falls back to label for the sheet title, rendered above the field too', () => {
  const renderer = renderSelect({
    ...baseProps,
    label: 'Customer',
    placeholder: 'Choose customer…',
  });

  // The label names the field before the sheet opens…
  expect(
    renderer.root
      .findAllByType(Text)
      .some(t => t.props.children === 'Customer'),
  ).toBe(true);

  // …and titles the sheet once it does.
  expect(openSheetAndGetTexts(renderer)).toContain('Customer');
});

it('prefers sheetTitle over label for the sheet when both are set', () => {
  const renderer = renderSelect({
    ...baseProps,
    label: 'Customer',
    sheetTitle: 'Pick a customer',
    placeholder: 'Choose customer…',
  });

  expect(openSheetAndGetTexts(renderer)).toContain('Pick a customer');
});

it('leaves the sheet untitled when neither sheetTitle nor label is set', () => {
  const renderer = renderSelect({
    ...baseProps,
    placeholder: 'Choose customer…',
  });
  const texts = openSheetAndGetTexts(renderer);

  // Only the two option rows — no title row.
  expect(texts).toEqual(['a', 'b']);
});

it('falls back through sheetTitle to placeholder for the trigger name', () => {
  const renderer = renderSelect({
    ...baseProps,
    placeholder: 'Choose customer…',
  });

  expect(triggerAccessibilityLabel(renderer)).toBe('Choose customer…');
});