/**
 * Tests for ManualAddressForm: the no-results fallback form inside
 * `AddressPickerSheet` — the address line gates "Use this address", the
 * entry is emitted trimmed (with a blank city nulled, matching the
 * app-wide "store null, not ''" rule), and "Back to search" is the only
 * way out besides the caller closing the sheet after a pick.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { Button } from '../../components/ui';
import { ManualAddressForm } from './ManualAddressForm';

const ADDRESS_PLACEHOLDER = 'e.g. Flat 302, Sunrise Apartments, Andheri West';

function renderForm() {
  const onBack = jest.fn();
  const onUse = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<ManualAddressForm onBack={onBack} onUse={onUse} />);
  });
  return { root: renderer.root, onBack, onUse };
}

function inputByPlaceholder(
  root: ReactTestRenderer.ReactTestInstance,
  placeholder: string,
) {
  const input = root
    .findAllByType(TextInput)
    .find(t => t.props.placeholder === placeholder);
  if (!input) throw new Error(`Input "${placeholder}" not found`);
  return input;
}

function type(root: ReactTestRenderer.ReactTestInstance, placeholder: string, text: string) {
  act(() => {
    inputByPlaceholder(root, placeholder).props.onChangeText(text);
  });
}

function useButton(root: ReactTestRenderer.ReactTestInstance) {
  const button = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Use this address');
  if (!button) throw new Error('Use button not found');
  return button;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('starts with "Use this address" disabled until an address line is entered', () => {
  const { root } = renderForm();
  expect(useButton(root).props.disabled).toBe(true);

  type(root, ADDRESS_PLACEHOLDER, '  ');
  expect(useButton(root).props.disabled).toBe(true);

  type(root, ADDRESS_PLACEHOLDER, 'Flat 302, Sunrise Apartments');
  expect(useButton(root).props.disabled).toBe(false);
});

it('emits the trimmed address line and a nulled city when blank', () => {
  const { root, onUse } = renderForm();
  type(root, ADDRESS_PLACEHOLDER, '  12 MG Road  ');
  type(root, 'Mumbai', '  ');

  act(() => {
    useButton(root).props.onPress();
  });

  expect(onUse).toHaveBeenCalledWith({
    addressLine: '12 MG Road',
    city: null,
  });
});

it('emits the trimmed city when present', () => {
  const { root, onUse } = renderForm();
  type(root, ADDRESS_PLACEHOLDER, '12 MG Road');
  type(root, 'Mumbai', '  Bengaluru  ');

  act(() => {
    useButton(root).props.onPress();
  });

  expect(onUse).toHaveBeenCalledWith({
    addressLine: '12 MG Road',
    city: 'Bengaluru',
  });
});

it('does not emit when "Use this address" is pressed with a blank-only address line', () => {
  const { root, onUse } = renderForm();
  type(root, ADDRESS_PLACEHOLDER, '   ');

  act(() => {
    useButton(root).props.onPress();
  });

  expect(onUse).not.toHaveBeenCalled();
});

it('offers exactly the address and city inputs — no structured pincode field', () => {
  // The structured `pincode` belongs to a resolved snapshot only; a manual
  // field whose value would be silently discarded is worse than no field.
  const { root } = renderForm();
  const placeholders = root.findAllByType(TextInput).map(t => t.props.placeholder);
  expect(placeholders).toEqual([ADDRESS_PLACEHOLDER, 'Mumbai']);
});

it('returns to search on "Back to search" without emitting', () => {
  const { root, onBack, onUse } = renderForm();
  const back = root.findByProps({ accessibilityLabel: 'Back to address search' });

  act(() => {
    back.props.onPress();
  });

  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onUse).not.toHaveBeenCalled();
});
