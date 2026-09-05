/**
 * Tests for CustomersScreen's "Add" wiring: pressing it pushes the full-page
 * `AddCustomerScreen` with `returnRouteName: 'Customers'`. There's nothing
 * else to read back here — `AddCustomerScreen` updates the shared
 * `useCustomers` store directly, so this screen's own subscription
 * re-renders on its own; that contract is `AddCustomerScreen.test.tsx`'s job.
 */
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn(),
}));

jest.mock('./useCustomers', () => ({
  useCustomers: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Button } from '../../components/ui';
import { useCustomers } from './useCustomers';
import CustomersScreen from './CustomersScreen';

const useCustomersMock = useCustomers as jest.Mock;

function mockStore(overrides: Record<string, unknown> = {}) {
  useCustomersMock.mockReturnValue({
    customers: [],
    hasCustomers: false,
    isLoading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<CustomersScreen />);
  });
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore();
});

it('pushes AddCustomer with returnRouteName Customers when "Add" is pressed', () => {
  const root = renderScreen();
  const addButton = root.findAllByType(Button).find(b => b.props.children === 'Add');

  act(() => {
    addButton?.props.onPress();
  });

  expect(mockNavigate).toHaveBeenCalledWith('AddCustomer', {
    returnRouteName: 'Customers',
  });
});
