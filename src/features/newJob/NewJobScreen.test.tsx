/**
 * Tests for NewJobScreen's `AddCustomer` wiring: "Add new" pushes the full
 * page with `returnRouteName: 'NewJob'`, and a `createdCustomerId` returned
 * in route params (set by `AddCustomerScreen` on a successful save) selects
 * that customer in the draft and clears the param. The actual creation
 * logic (POST /customers, the Places field mapping) now lives in
 * `AddCustomerScreen` — see `AddCustomerScreen.test.tsx` for that.
 */
jest.mock('../customers', () => ({
  useCustomers: jest.fn(() => ({
    customers: [],
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../profile', () => ({
  useMyProfile: jest.fn(() => ({
    profile: null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  })),
  loadMyProfile: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import NewJobScreen from './NewJobScreen';

function renderScreen(createdCustomerId?: string) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const route = {
    params: createdCustomerId !== undefined ? { createdCustomerId } : undefined,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <NewJobScreen navigation={navigation as never} route={route as never} />,
    );
  });
  return { root: renderer.root, navigation, route };
}

function customerSelectValue(root: ReactTestRenderer.ReactTestInstance) {
  return root.findByProps({ label: 'Customer' }).props.value;
}

it('leaves the customer unselected and never clears params when the route carries none', () => {
  const { root, navigation } = renderScreen();

  expect(customerSelectValue(root)).toBeUndefined();
  expect(navigation.setParams).not.toHaveBeenCalled();
});

it('selects the returned createdCustomerId in the draft and clears the route param', () => {
  const { root, navigation } = renderScreen('cust-1');

  expect(customerSelectValue(root)).toBe('cust-1');
  expect(navigation.setParams).toHaveBeenCalledWith({ createdCustomerId: undefined });
});

it('"Add new" pushes AddCustomer with this screen as the return route', () => {
  const { root, navigation } = renderScreen();
  const addCustomerLink = root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(instance =>
      instance
        .findAllByType(Text)
        .some(t => typeof t.props.children === 'string' && t.props.children.includes('Add new')),
    );

  act(() => {
    addCustomerLink?.props.onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('AddCustomer', {
    returnRouteName: 'NewJob',
  });
});
