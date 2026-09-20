/**
 * AddTechnicianSheet wiring tests.
 *
 * 1. Skill picker (story 5.1 review follow-up): the sheet must load from the
 *    shared `useSkills` store when it opens — never run a private fetch — and
 *    must not fetch while closed.
 *
 * 2. Submit contract (inline-add review follow-up): the sheet owns the
 *    submit UX — a resolved `onSubmit` closes and resets the form, a
 *    rejected one maps the error to copy and stays open. No screen suite
 *    exercises this path (both consumers stub the sheet), so this suite is
 *    the only place the real `handleSubmit` runs.
 */
jest.mock('../../skills', () => ({
  loadSkills: jest.fn().mockResolvedValue(undefined),
  useSkills: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, Input, MultiSelect } from '../../../components/ui';
import { loadSkills, useSkills } from '../../skills';
import { AddTechnicianSheet } from './AddTechnicianSheet';

const loadSkillsMock = loadSkills as jest.Mock;
const useSkillsMock = useSkills as jest.Mock;

function mockStore(overrides: Record<string, unknown> = {}) {
  useSkillsMock.mockReturnValue({
    skills: [],
    isLoading: false,
    error: null,
    ...overrides,
  });
}

type SheetProps = {
  visible?: boolean;
  onClose?: () => void;
  onSubmit?: (input: unknown) => Promise<void>;
};

function renderSheet(props: SheetProps = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet
        visible={props.visible ?? true}
        onClose={props.onClose ?? (() => {})}
        onSubmit={props.onSubmit ?? (async () => {})}
      />,
    );
  });
  return renderer.root;
}

/** Fills the form through the real inputs so `canSubmit` gates honestly. */
function fillValidForm(root: ReactTestRenderer.ReactTestInstance) {
  const inputs = root.findAllByType(Input);
  act(() => inputs[0].props.onChangeText('Vel Murugan'));
  act(() => inputs[1].props.onChangeText('9123456780'));
  act(() => root.findByType(MultiSelect).props.onChange(['s1']));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore();
});

it('loads skills from the shared store when the sheet opens, not while closed', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet visible={false} onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  // The sheet stays mounted while hidden — the hook's own first-mount load
  // must be silenced (`autoLoad: false`) or merely rendering Technicians
  // would fire the GET before any sheet is opened.
  expect(useSkillsMock).toHaveBeenCalledWith({ autoLoad: false });
  expect(loadSkillsMock).not.toHaveBeenCalled();

  act(() => {
    renderer.update(
      <AddTechnicianSheet visible onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  expect(loadSkillsMock).toHaveBeenCalledTimes(1);

  act(() => {
    renderer.update(
      <AddTechnicianSheet visible={false} onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  expect(loadSkillsMock).toHaveBeenCalledTimes(1);
});

it('offers exactly the skills the shared store holds', () => {
  const options = [
    { value: 's1', label: 'AC repair' },
    { value: 's2', label: 'Wiring' },
  ];
  mockStore({
    skills: [
      { id: 's1', name: 'AC repair' },
      { id: 's2', name: 'Wiring' },
    ],
  });
  const root = renderSheet({ visible: true });
  const multiSelect = root.findByType(MultiSelect);
  expect(multiSelect.props.options).toEqual(options);
  expect(multiSelect.props.disabled).toBe(false);
});

// --- Submit contract ---------------------------------------------------------

it('closes and resets after a successful submit', async () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const root = renderSheet({ visible: true, onClose, onSubmit });

  fillValidForm(root);
  const button = root.findByType(Button);
  expect(button.props.disabled).toBe(false);

  await act(async () => {
    button.props.onPress();
  });

  expect(onSubmit).toHaveBeenCalledWith({
    name: 'Vel Murugan',
    phone: '9123456780',
    skillIds: ['s1'],
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  // Reset on success — reopening shows a blank form, not the sent values.
  expect(root.findAllByType(Input)[0].props.value).toBe('');
});

it('stays open with the mapped error when the invite fails', async () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const onClose = jest.fn();
  const onSubmit = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'DUPLICATE_RESOURCE' }),
      );
  const root = renderSheet({ visible: true, onClose, onSubmit });

  fillValidForm(root);
  await act(async () => {
    root.findByType(Button).props.onPress();
  });

  expect(onClose).not.toHaveBeenCalled();
  const hasErrorText = root
    .findAllByType(Text)
    .some(t => t.props.children === 'This phone number is already part of your team.');
  expect(hasErrorText).toBe(true);
  // The failed submit must not wipe the form — the owner only fixes what's
  // wrong (the phone), not retypes everything.
  expect(root.findAllByType(Input)[0].props.value).toBe('Vel Murugan');
});