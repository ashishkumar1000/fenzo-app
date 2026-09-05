/**
 * Tests for the EditNameSheet contract (story 5.2): prefill + disabled
 * logic, the success path (PATCH response stored wholesale via
 * `setProfileFromServer`, sheet closes), and the 422/network path (inline
 * message, sheet stays open).
 *
 * Both collaborators are mocked: `usersApi.updateMe` (the network) and
 * `setProfileFromServer` (the store write) — this file tests that the sheet
 * wires them together correctly. The store-level behaviour of
 * `setProfileFromServer` itself is covered in `__tests__/useMyProfile.test.ts`.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { Button } from '../../../components/ui';
import { EditNameSheet } from './EditNameSheet';

jest.mock('../../../services', () => ({
  usersApi: { updateMe: jest.fn() },
}));

jest.mock('../useMyProfile', () => ({
  setProfileFromServer: jest.fn(),
}));

import { usersApi } from '../../../services';
import { setProfileFromServer } from '../useMyProfile';

const updateMe = usersApi.updateMe as jest.Mock;
const storeProfile = setProfileFromServer as jest.Mock;

function renderSheet(props: Parameters<typeof EditNameSheet>[0]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<EditNameSheet {...props} />);
  });
  return renderer.root;
}

function typeName(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    root.findByType(TextInput).props.onChangeText(text);
  });
}

function findSave(root: ReactTestRenderer.ReactTestInstance) {
  const save = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Save');
  if (!save) throw new Error('Save button not found');
  return save;
}

function submit(root: ReactTestRenderer.ReactTestInstance) {
  act(() => {
    void findSave(root).props.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('prefills with the current name and disables Save while unchanged or empty', () => {
  const root = renderSheet({ visible: true, currentName: 'Kumar', onClose: () => {} });
  expect(root.findByType(TextInput).props.value).toBe('Kumar');

  // Unchanged (trim-normalized, like the server): disabled.
  typeName(root, 'Kumar ');
  expect(findSave(root).props.disabled).toBe(true);

  // Whitespace only — trimmed-empty is invalid even though the current
  // name is non-empty: disabled.
  typeName(root, '   ');
  expect(findSave(root).props.disabled).toBe(true);

  // A real change: enabled.
  typeName(root, 'Kumar S');
  expect(findSave(root).props.disabled).toBe(false);
});

it('starts empty and disabled when the profile has no name yet', () => {
  // A fresh owner's `name` is null until this sheet saves one.
  const root = renderSheet({ visible: true, currentName: null, onClose: () => {} });
  expect(root.findByType(TextInput).props.value).toBe('');
  expect(findSave(root).props.disabled).toBe(true);
});

it('sends the trimmed name, stores the response wholesale, and closes on success', async () => {
  const onClose = jest.fn();
  const patchedProfile = { id: 'u-1', name: 'Kumar S' };
  updateMe.mockResolvedValueOnce(patchedProfile);
  const root = renderSheet({ visible: true, currentName: 'Kumar', onClose });

  typeName(root, '  Kumar S  ');
  await act(async () => {
    submit(root);
  });

  expect(updateMe).toHaveBeenCalledWith({ name: 'Kumar S' });
  // The PATCH response IS the fresh profile — passed to the store as-is,
  // not refetched.
  expect(storeProfile).toHaveBeenCalledWith(patchedProfile);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows the 422 message inline and keeps the sheet open', async () => {
  const onClose = jest.fn();
  updateMe.mockRejectedValueOnce({
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'name must be longer than or equal to 1 characters',
    details: null,
  });
  const root = renderSheet({ visible: true, currentName: 'Kumar', onClose });

  typeName(root, 'Kumar S');
  await act(async () => {
    submit(root);
  });

  expect(onClose).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('name must be longer than or equal to 1 characters');
});

it('shows network failures inline too, and clears the error on the next edit', async () => {
  const onClose = jest.fn();
  updateMe.mockRejectedValueOnce({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Could not reach the server. Check your connection and try again.',
  });
  const root = renderSheet({ visible: true, currentName: 'Kumar', onClose });

  typeName(root, 'Kumar S');
  await act(async () => {
    submit(root);
  });

  expect(onClose).not.toHaveBeenCalled();
  let texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('Could not reach the server. Check your connection and try again.');

  // Editing again clears the stale error while the user fixes the input.
  act(() => {
    root.findByType(TextInput).props.onChangeText('Kumar S2');
  });
  texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).not.toContain('Could not reach the server. Check your connection and try again.');
});

it('resyncs on reopen but keeps the draft when the profile updates mid-edit', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <EditNameSheet visible={false} currentName="Kumar" onClose={() => {}} />,
    );
  });
  const root = renderer.root;

  // Opening prefills with the (possibly changed) server name.
  act(() => {
    renderer.update(<EditNameSheet visible currentName="Kumar" onClose={() => {}} />);
  });
  expect(root.findByType(TextInput).props.value).toBe('Kumar');

  // The user starts typing...
  typeName(root, 'Kumar S');

  // ...and a background profile update lands while the sheet is open: the
  // draft must survive (the resync fires on the open transition only).
  act(() => {
    renderer.update(<EditNameSheet visible currentName="Renamed" onClose={() => {}} />);
  });
  expect(root.findByType(TextInput).props.value).toBe('Kumar S');

  // Closing and reopening resyncs to the new server name.
  act(() => {
    renderer.update(<EditNameSheet visible={false} currentName="Renamed" onClose={() => {}} />);
  });
  act(() => {
    renderer.update(<EditNameSheet visible currentName="Renamed" onClose={() => {}} />);
  });
  expect(root.findByType(TextInput).props.value).toBe('Renamed');
});

it('uses the Button loading state while the PATCH is in flight', async () => {
  const onClose = jest.fn();
  const patchedProfile = { id: 'u-1', name: 'Kumar S' };
  let resolve!: (value: typeof patchedProfile) => void;
  updateMe.mockImplementationOnce(
    () => new Promise<typeof patchedProfile>(res => (resolve = res)),
  );
  const root = renderSheet({ visible: true, currentName: 'Kumar', onClose });

  typeName(root, 'Kumar S');
  await act(async () => {
    submit(root);
  });
  expect(findSave(root).props.loading).toBe(true);
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    resolve(patchedProfile);
  });
  expect(findSave(root).props.loading).toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
});
