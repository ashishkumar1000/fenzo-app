/**
 * CustomersScreen's story 2-1 entry point (AC 1): a CustomerRow tap navigates
 * to CustomerDetail with the tapped customer's id. The rest of the screen
 * (list fetch, search, add-sheet) is covered by its own story — here only the
 * navigation wiring is under test, so services are mocked at the boundary and
 * `useFocusEffect` runs its callback immediately.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // Run the focus callback synchronously so the initial load fires.
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock('../src/services', () => ({
  customerService: { list: jest.fn(), create: jest.fn() },
}));

import CustomersScreen from '../src/features/customers/CustomersScreen';
import { customerService } from '../src/services';

const list = customerService.list as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

it('navigates to CustomerDetail with the customer id when a row is tapped', async () => {
  list.mockResolvedValue({
    data: [
      {
        id: 'c-7',
        name: 'Ravi Kumar',
        countryCode: '+91',
        phoneNumber: '9000000002',
        address: '12 Anna Nagar',
        city: 'Chennai',
        jobCount: 2,
        lastJobDate: '2026-08-12T10:00:00Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CustomersScreen />);
  });
  await ReactTestRenderer.act(async () => {}); // let the fetch resolve

  const nameText = renderer.root.find(
    node => node.type === Text && node.props.children === 'Ravi Kumar',
  );
  // Walk up to the Card's Pressable.
  let current: ReactTestRenderer.ReactTestInstance | null = nameText;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  await ReactTestRenderer.act(async () => {
    current!.props.onPress();
  });

  expect(mockNavigate).toHaveBeenCalledWith('CustomerDetail', { customerId: 'c-7' });
});