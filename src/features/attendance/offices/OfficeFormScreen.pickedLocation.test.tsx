/**
 * Targeted contract test for the OfficeFormScreen ↔ OfficeMapPickerScreen
 * handoff (Story 15-4): the picker returns its FINAL pin via
 * navigate-back-with-params (`pickedLocation`, the SelectSkills pattern),
 * and the form must apply the coordinates/radius and show the GPS chip.
 * The repo pins this pattern per consumer screen (see NewJobScreen.test.tsx
 * for `createdCustomerId`/`selectedSkillId`); full screen-level suites are
 * deferred (15-4 review, decision 3a).
 */
jest.mock('../../../services', () => ({
  officesService: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import OfficeFormScreen from './OfficeFormScreen';

const PICKED = {
  latitude: 19.1364,
  longitude: 72.8296,
  radiusM: 200,
  gpsVerified: true,
};

function renderForm(params?: Record<string, unknown>) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <OfficeFormScreen
        navigation={navigation as never}
        route={{ params } as never}
      />,
    );
  });
  return { root: renderer.root, navigation, renderer };
}

/**
 * The form renders coordinates with 5 decimals, comma-separated. RN mirrors
 * nodes onto host wrappers in this tree (the React 19 duplicate-fiber quirk
 * noted in AddressPickerSheet.test.tsx), so presence is asserted as "> 0",
 * never an exact doubled count.
 */
function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByProps({ children: text }).length > 0;
}

describe('OfficeFormScreen pickedLocation handoff', () => {
  it('applies the picked pin — coordinates render, the placeholder is gone', () => {
    const { root } = renderForm({ pickedLocation: PICKED });

    expect(hasText(root, '19.13640, 72.82960')).toBe(true);
    expect(hasText(root, 'No pin placed yet')).toBe(false);
  });

  it('shows the GPS Verified chip only when the pin is the device fix', () => {
    const { root } = renderForm({ pickedLocation: PICKED });
    expect(hasText(root, 'GPS Verified')).toBe(true);

    const unverified = renderForm({
      pickedLocation: { ...PICKED, gpsVerified: false },
    });
    expect(hasText(unverified.root, 'GPS Verified')).toBe(false);
  });

  it('still shows the "No pin placed yet" placeholder without route params', () => {
    const { root } = renderForm({});

    expect(hasText(root, '19.13640, 72.82960')).toBe(false);
    expect(hasText(root, 'No pin placed yet')).toBe(true);
  });
});
