/**
 * Tests for the AddSkillSheet 409 contract (story 5.1): a duplicate-name
 * rejection keeps the sheet open with the inline "This skill already exists"
 * copy, while a successful save closes it. The store-level behaviours around
 * add/delete live in `useSkills.test.tsx`.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { Button } from '../../../components/ui';
import { AddSkillSheet } from './AddSkillSheet';

function renderSheet(props: Parameters<typeof AddSkillSheet>[0]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<AddSkillSheet {...props} />);
  });
  return renderer.root;
}

function typeName(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    root.findByType(TextInput).props.onChangeText(text);
  });
}

function submit(root: ReactTestRenderer.ReactTestInstance) {
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add skill');
  if (!submitButton) throw new Error('Submit button not found');
  act(() => {
    void submitButton.props.onPress?.();
  });
}

it('disables submit until a non-blank name is entered', () => {
  const root = renderSheet({ visible: true, onClose: () => {}, onSubmit: async () => {} });
  const buttons = root.findAllByType(Button);
  const submitButton = buttons.find(b => b.props.children === 'Add skill');
  expect(submitButton?.props.disabled).toBe(true);

  typeName(root, '   ');
  expect(submitButton?.props.disabled).toBe(true);

  typeName(root, 'AC repair');
  expect(submitButton?.props.disabled).toBe(false);
});

it('shows the duplicate copy and stays open when the save rejects with 409', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockRejectedValueOnce({
    status: 409,
    code: 'DUPLICATE_RESOURCE',
    message: 'A skill with this name already exists for your company',
    details: null,
  });
  const root = renderSheet({ visible: true, onClose, onSubmit });

  typeName(root, 'AC repair');
  await act(async () => {
    submit(root);
  });

  expect(onSubmit).toHaveBeenCalledWith('AC repair');
  expect(onClose).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('This skill already exists');
});

it('closes and resets when the save succeeds', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValueOnce(undefined);
  const root = renderSheet({ visible: true, onClose, onSubmit });

  typeName(root, 'AC repair');
  await act(async () => {
    submit(root);
  });

  expect(onClose).toHaveBeenCalledTimes(1);
  // The input is cleared, so a reopen doesn't carry the old name in.
  expect(root.findByType(TextInput).props.value).toBe('');
});
