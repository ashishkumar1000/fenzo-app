/**
 * Wiring tests for AddTechnicianSheet's skill picker (story 5.1 review
 * follow-up): the sheet must load from the shared `useSkills` store when it
 * opens — never run a private fetch — and must not fetch while closed. The
 * rest of the sheet's form behaviour is unchanged from before the story.
 */
jest.mock('../../skills', () => ({
  loadSkills: jest.fn().mockResolvedValue(undefined),
  useSkills: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { MultiSelect } from '../../../components/ui';
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

function renderSheet(visible: boolean) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet visible={visible} onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  return renderer.root;
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
      { id: 's1', name: 'AC repair', tenantId: 't1', createdAt: '2026-08-01T06:00:00.000Z' },
      { id: 's2', name: 'Wiring', tenantId: 't1', createdAt: '2026-08-01T06:00:00.000Z' },
    ],
  });
  const root = renderSheet(true);
  const multiSelect = root.findByType(MultiSelect);
  expect(multiSelect.props.options).toEqual(options);
  expect(multiSelect.props.disabled).toBe(false);
});