/**
 * TechniciansScreen — pins the `autoOpenAdd` route param (Home's
 * "Add technician" quick action, product feedback 2026-09-20): the Add sheet
 * is already open on arrival, a plain push leaves it closed, and once the
 * user closes it a re-render with identical params must not reopen it —
 * the param is read once as initial state, so a user-closed sheet stays
 * closed.
 *
 * `AddTechnicianSheet` is stubbed to a prop-capturing placeholder; the
 * sheet's own behaviour is `AddTechnicianSheet.test.tsx`'s job.
 */
jest.mock('../components/AddTechnicianSheet', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    AddTechnicianSheet: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'add-technician-sheet', ...props }),
  };
});

jest.mock('../useTechnicians', () => ({
  useTechnicians: () => ({
    technicians: [],
    hasTechnicians: false,
    add: jest.fn().mockResolvedValue(undefined),
  }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '../../../components/ui';
import TechniciansScreen from '../TechniciansScreen';

const mountedRenderers: ReactTestRenderer[] = [];

function renderScreen(autoOpenAdd?: boolean) {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = {
    key: 'Technicians',
    name: 'Technicians',
    params: autoOpenAdd === undefined ? undefined : { autoOpenAdd },
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <TechniciansScreen navigation={navigation as never} route={route as never} />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, renderer, navigation };
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

function sheetProps(root: ReactTestInstance): Record<string, unknown> {
  return root.findByProps({ testID: 'add-technician-sheet' }).props;
}

it('opens the Add sheet on arrival when pushed with autoOpenAdd', () => {
  const { root } = renderScreen(true);

  expect(sheetProps(root).visible).toBe(true);
});

it('leaves the sheet closed on a plain push (no params)', () => {
  const { root } = renderScreen();

  expect(sheetProps(root).visible).toBe(false);
});

it('treats an explicit autoOpenAdd: false like a plain push', () => {
  const { root } = renderScreen(false);

  expect(sheetProps(root).visible).toBe(false);
});

it('does not reopen the sheet on a re-render after the user closed it', () => {
  const { root, renderer } = renderScreen(true);

  act(() => {
    (sheetProps(root).onClose as () => void)();
  });
  expect(sheetProps(root).visible).toBe(false);

  // Re-render with identical params — what the stack serves when this push
  // re-renders. The closed state must survive it.
  act(() => {
    renderer.update(
      <TechniciansScreen
        navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
        route={{ key: 'Technicians', name: 'Technicians', params: { autoOpenAdd: true } } as never}
      />,
    );
  });
  expect(sheetProps(root).visible).toBe(false);
});

it('the header Add button still opens the sheet', () => {
  const { root } = renderScreen();

  const add = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add');
  if (!add) throw new Error('Header Add button not found');

  act(() => {
    add.props.onPress();
  });
  expect(sheetProps(root).visible).toBe(true);
});
