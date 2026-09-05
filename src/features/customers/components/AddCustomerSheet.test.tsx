/**
 * Tests for the AddCustomerSheet form bindings. This sheet's render tree was
 * rewritten for the native `Sheet` and — unlike its four sibling sheets — it
 * is stubbed out in both consumers' tests, so this file is its only coverage:
 * enablement, phone normalisation, the close-and-reset on success, and the
 * inline 409 copy on a duplicate phone.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { Button } from '../../../components/ui';
import { AddCustomerSheet } from './AddCustomerSheet';

const noop = async () => {};

function renderSheet(props: Parameters<typeof AddCustomerSheet>[0]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<AddCustomerSheet {...props} />);
  });
  return renderer.root;
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

function typeName(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    inputByPlaceholder(root, 'e.g. Ramesh Kumar').props.onChangeText(text);
  });
}

function typePhone(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    inputByPlaceholder(root, '98765 43210').props.onChangeText(text);
  });
}

function submit(root: ReactTestRenderer.ReactTestInstance) {
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add customer');
  if (!submitButton) throw new Error('Submit button not found');
  act(() => {
    void submitButton.props.onPress?.();
  });
}

it('disables submit until a name and a 10-digit phone are entered', () => {
  const root = renderSheet({ visible: true, onClose: () => {}, onSubmit: noop });
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add customer');

  expect(submitButton?.props.disabled).toBe(true);

  typeName(root, 'Ramesh');
  expect(submitButton?.props.disabled).toBe(true);

  typePhone(root, '9876543210');
  expect(submitButton?.props.disabled).toBe(false);
});

it('strips non-digits from the phone and caps it at 10', () => {
  const root = renderSheet({ visible: true, onClose: () => {}, onSubmit: noop });

  typePhone(root, '98a76-5432x1099');
  expect(inputByPlaceholder(root, '98765 43210').props.value).toBe('9876543210');
});

it('submits trimmed values, then closes and resets on success', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValueOnce(undefined);
  const root = renderSheet({ visible: true, onClose, onSubmit });

  typeName(root, '  Ramesh Kumar  ');
  typePhone(root, '9876543210');
  await act(async () => {
    submit(root);
  });

  expect(onSubmit).toHaveBeenCalledWith({
    name: 'Ramesh Kumar',
    phone: '9876543210',
    city: '',
    area: '',
    address: '',
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  // A reopen must not carry the old values in.
  expect(inputByPlaceholder(root, 'e.g. Ramesh Kumar').props.value).toBe('');
});

it('shows the duplicate-phone copy and stays open on a 409', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockRejectedValueOnce({
    status: 409,
    code: 'DUPLICATE_RESOURCE',
    message: 'A customer with this phone number already exists',
    details: null,
  });
  const root = renderSheet({ visible: true, onClose, onSubmit });

  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');
  await act(async () => {
    submit(root);
  });

  expect(onSubmit).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('A customer with this phone number already exists.');
});