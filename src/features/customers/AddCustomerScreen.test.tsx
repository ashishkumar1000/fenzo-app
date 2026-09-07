/**
 * Tests for AddCustomerScreen: form bindings (enablement, phone
 * normalisation, the close-and-reset-on-success / stays-open-on-409
 * contract), the address field opening `AddressPickerSheet` on a tap
 * anywhere on it (not just an icon — see the file doc on why), populating
 * from a resolved pick, and the returnRouteName-based post-save navigation
 * (`goBack()` for Customers, `createdCustomerId` param for NewJob).
 *
 * `AddressPickerSheet` is stubbed to a prop-capturing placeholder (its own
 * behaviour is `AddressPickerSheet.test.tsx`'s job).
 */
jest.mock('../addressPicker', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    AddressPickerSheet: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'address-picker-sheet', ...props }),
  };
});

jest.mock('./useCustomers', () => ({
  upsertCustomer: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { Button } from '../../components/ui';
import { customerService } from '../../services';
import type { CreatedCustomer, ResolvedPlace } from '../../services';
import { upsertCustomer, loadCustomers } from './useCustomers';
import AddCustomerScreen from './AddCustomerScreen';

const createSpy = jest.spyOn(customerService, 'create');
const upsertCustomerMock = upsertCustomer as jest.Mock;
const loadCustomersMock = loadCustomers as jest.Mock;

// `addListener` returns the unsubscribe function navigation effects rely on.
const noopNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

// react-test-renderer has no automatic cleanup (unlike RTL's `render`), so
// every renderer is tracked here and unmounted in afterEach — a live screen
// whose `Animated` pulse is still running otherwise keeps rescheduling
// animation frames after the test environment tears down, crashing the
// Jest worker.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderScreen(returnRouteName: 'Customers' | 'NewJob' = 'Customers') {
  const navigation = { ...noopNavigation, navigate: jest.fn(), goBack: jest.fn() };
  const route = { params: { returnRouteName } };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddCustomerScreen navigation={navigation as never} route={route as never} />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, navigation };
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

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

function addressPickerProps(root: ReactTestRenderer.ReactTestInstance) {
  return root.findByProps({ testID: 'address-picker-sheet' }).props;
}

function addressFieldTrigger(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityLabel: 'Search for an address' })
    .find(instance => typeof instance.props.onPress === 'function');
}

const RESOLVED: ResolvedPlace = {
  placeId: 'place-1',
  formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001',
  city: 'Bengaluru',
  pincode: '560001',
  latitude: 12.9716,
  longitude: 77.5946,
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('disables submit until a name and a 10-digit phone are entered', () => {
  const { root } = renderScreen();
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add customer');
  expect(submitButton?.props.disabled).toBe(true);

  typeName(root, 'Ramesh Kumar');
  typePhone(root, '98765');
  expect(submitButton?.props.disabled).toBe(true);

  typePhone(root, '9876543210');
  expect(submitButton?.props.disabled).toBe(false);
});

it('strips non-digits from the phone and caps it at 10', () => {
  const { root } = renderScreen();
  typePhone(root, '98-76a54!32109999');
  expect(inputByPlaceholder(root, '98765 43210').props.value).toBe('9876543210');
});

it('shows the duplicate-phone copy and stays open on a 409', async () => {
  createSpy.mockRejectedValueOnce({ status: 409, message: 'Conflict' });
  const { root, navigation } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  expect(navigation.goBack).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('A customer with this phone number already exists.');
});

it('opens the address picker sheet when the address field is tapped', () => {
  const { root } = renderScreen();
  expect(addressPickerProps(root).visible).toBe(false);

  act(() => {
    addressFieldTrigger(root)?.props.onPress();
  });

  expect(addressPickerProps(root).visible).toBe(true);
});

it('populates the address field and closes the sheet on a resolved pick', () => {
  const { root } = renderScreen();

  act(() => {
    addressFieldTrigger(root)?.props.onPress();
  });
  act(() => {
    addressPickerProps(root).onResolved(RESOLVED);
  });

  expect(inputByPlaceholder(root, 'Tap to search for an address').props.value).toBe(
    RESOLVED.formattedAddress,
  );
  expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe(RESOLVED.city);
  expect(addressPickerProps(root).visible).toBe(false);
});

it('the address field is not directly editable — only the picker sets it', () => {
  const { root } = renderScreen();
  expect(inputByPlaceholder(root, 'Tap to search for an address').props.editable).toBe(
    false,
  );
});

describe('manual address entry (no-results fallback)', () => {
  const MANUAL = {
    addressLine: 'Flat 302, Sunrise Apartments, Andheri West',
    city: 'Mumbai',
  };

  function pickManually(root: ReactTestRenderer.ReactTestInstance) {
    act(() => {
      addressFieldTrigger(root)?.props.onPress();
    });
    act(() => {
      addressPickerProps(root).onManualAddress(MANUAL);
    });
  }

  it('populates the address and city fields and closes the sheet', () => {
    const { root } = renderScreen();

    pickManually(root);

    expect(
      inputByPlaceholder(root, 'Tap to search for an address').props.value,
    ).toBe(MANUAL.addressLine);
    expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe(MANUAL.city);
    expect(addressPickerProps(root).visible).toBe(false);
  });

  it('leaves the City field untouched when the entry carries no city', () => {
    const { root } = renderScreen();
    act(() => {
      inputByPlaceholder(root, 'Mumbai').props.onChangeText('Pune');
    });

    act(() => {
      addressPickerProps(root).onManualAddress({ ...MANUAL, city: null });
    });

    expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe('Pune');
    // The address line itself still lands.
    expect(
      inputByPlaceholder(root, 'Tap to search for an address').props.value,
    ).toBe(MANUAL.addressLine);
  });

  it('omits all 5 resolved snapshot fields from the create payload', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-6',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: MANUAL.addressLine,
      city: MANUAL.city,
    });
    const { root } = renderScreen();
    typeName(root, 'Ramesh Kumar');
    typePhone(root, '9876543210');

    pickManually(root);

    await act(async () => {
      submit(root);
    });

    // A hand-typed address has no placeId/coordinates — the manual pincode
    // must NOT sneak into the structured snapshot either (that field belongs
    // to a resolved place only).
    const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.address).toBe(MANUAL.addressLine);
    expect(payload.city).toBe(MANUAL.city);
    expect(payload).not.toHaveProperty('formattedAddress');
    expect(payload).not.toHaveProperty('pincode');
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).not.toHaveProperty('placeId');
  });

  it('drops a previously resolved snapshot when a manual entry replaces it', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-7',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: MANUAL.addressLine,
      city: MANUAL.city,
    });
    const { root } = renderScreen();
    typeName(root, 'Ramesh Kumar');
    typePhone(root, '9876543210');

    // First a resolved pick (snapshot fields set), then the user reopens
    // and enters a manual address instead.
    act(() => {
      addressFieldTrigger(root)?.props.onPress();
    });
    act(() => {
      addressPickerProps(root).onResolved(RESOLVED);
    });
    pickManually(root);

    await act(async () => {
      submit(root);
    });

    // The OLD pick's placeId/coordinates must not ride along with the NEW
    // text — the map pin would silently point at the abandoned place.
    const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.address).toBe(MANUAL.addressLine);
    expect(payload).not.toHaveProperty('formattedAddress');
    expect(payload).not.toHaveProperty('pincode');
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).not.toHaveProperty('placeId');
  });
});

describe('submitting with returnRouteName: Customers', () => {
  it('creates the customer, updates the shared store, and goes back — no params needed', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-1',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: null,
      city: null,
    });
    const { root, navigation } = renderScreen('Customers');
    typeName(root, 'Ramesh Kumar');
    typePhone(root, '9876543210');

    await act(async () => {
      submit(root);
    });

    expect(upsertCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cust-1' }),
    );
    expect(loadCustomersMock).toHaveBeenCalledWith({ force: true });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('submitting with returnRouteName: NewJob', () => {
  it('returns the created customer id via navigation params instead of going back', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-2',
      name: 'Suresh Rao',
      countryCode: '+91',
      phoneNumber: '9876500000',
      address: null,
      city: null,
    });
    const { root, navigation } = renderScreen('NewJob');
    typeName(root, 'Suresh Rao');
    typePhone(root, '9876500000');

    await act(async () => {
      submit(root);
    });

    expect(navigation.navigate).toHaveBeenCalledWith({
      name: 'NewJob',
      params: { createdCustomerId: 'cust-2' },
      merge: true,
    });
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

it('blocks hardware/gesture back while the save is in flight, then frees it', async () => {
  let resolveCreate!: (customer: CreatedCustomer) => void;
  createSpy.mockReturnValueOnce(
    new Promise(resolve => {
      resolveCreate = resolve;
    }),
  );
  const { root, navigation } = renderScreen('Customers');
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  // No guard while the form is idle — leaving the screen is allowed.
  expect(navigation.addListener).not.toHaveBeenCalledWith(
    'beforeRemove',
    expect.any(Function),
  );

  act(() => {
    void submit(root);
  });

  const listenerCalls = (
    navigation.addListener as jest.Mock
  ).mock.calls.filter(
    ([event]: [string, unknown]) => event === 'beforeRemove',
  );
  expect(listenerCalls).toHaveLength(1);
  const beforeRemove = listenerCalls[0][1];
  const event = { preventDefault: jest.fn() };
  beforeRemove(event);
  expect(event.preventDefault).toHaveBeenCalled();

  // Once the save settles, the guard is removed — navigation is free again.
  await act(async () => {
    resolveCreate({
      id: 'cust-4',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: null,
      city: null,
    });
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('sends the 5 resolved fields alongside existing fields on submit', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-3',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: RESOLVED.formattedAddress,
    city: RESOLVED.city,
  });
  const { root } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  act(() => {
    addressFieldTrigger(root)?.props.onPress();
  });
  act(() => {
    addressPickerProps(root).onResolved(RESOLVED);
  });

  await act(async () => {
    submit(root);
  });

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      formattedAddress: RESOLVED.formattedAddress,
      pincode: RESOLVED.pincode,
      latitude: RESOLVED.latitude,
      longitude: RESOLVED.longitude,
      placeId: RESOLVED.placeId,
    }),
  );
});

it('omits the 5 resolved fields entirely when the picker was never used', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-4',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
    city: null,
  });
  const { root } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload).not.toHaveProperty('formattedAddress');
  expect(payload).not.toHaveProperty('pincode');
  expect(payload).not.toHaveProperty('latitude');
  expect(payload).not.toHaveProperty('longitude');
  expect(payload).not.toHaveProperty('placeId');
});

it('trims leading/trailing whitespace from name and city on submit', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-5',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
    city: 'Mumbai',
  });
  const { root } = renderScreen();
  typeName(root, '  Ramesh Kumar  ');
  typePhone(root, '9876543210');
  act(() => {
    inputByPlaceholder(root, 'Mumbai').props.onChangeText('  Mumbai  ');
  });

  await act(async () => {
    submit(root);
  });

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Ramesh Kumar', city: 'Mumbai' }),
  );
});
