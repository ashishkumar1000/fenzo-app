/**
 * Tests for useLocateMe: the permission→fix pipeline and the distinct
 * failure shapes the map picker renders — denied (plus the Settings
 * deep-link only after a SECOND denial), a timeout message distinct from
 * denied, a generic fix failure, and the fresh fix resolving the
 * coordinates. `geolocation` is mocked at its module boundary; `Linking`
 * is mocked so `openSettings` never leaves the test runtime.
 */
jest.mock('react-native', () => ({
  Linking: { openSettings: jest.fn() },
}));

jest.mock('../../technicianApp/geolocation', () => ({
  requestLocationPermission: jest.fn(),
  getCurrentPosition: jest.fn(),
}));

import { Linking } from 'react-native';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../../technicianApp/geolocation';
import {
  LOCATE_DENIED_MESSAGE,
  LOCATE_FAILED_MESSAGE,
  LOCATE_TIMEOUT_MESSAGE,
  useLocateMe,
} from './useLocateMe';

const requestPermissionMock = requestLocationPermission as jest.Mock;
const getCurrentPositionMock = getCurrentPosition as jest.Mock;
const openSettingsMock = Linking.openSettings as jest.Mock;

let probe: ReturnType<typeof useLocateMe>;
function Probe() {
  probe = useLocateMe();
  return null;
}

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

async function locateAndFlush() {
  let result: { latitude: number; longitude: number } | null = null;
  await act(async () => {
    result = await probe.locate();
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  renderProbe();
});

describe('the happy path', () => {
  it('requests a FRESH fix and resolves the coordinates', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockResolvedValueOnce({
      latitude: 19.1364,
      longitude: 72.8296,
      accuracy: 12,
    });

    const result = await locateAndFlush();

    expect(result).toEqual({ latitude: 19.1364, longitude: 72.8296 });
    expect(getCurrentPositionMock).toHaveBeenCalledWith();
    expect(probe.error).toBeNull();
    expect(probe.errorMessage).toBeNull();
    expect(probe.locating).toBe(false);
  });
});

describe('permission denial', () => {
  it('maps a denial to the denied message and no fix attempt', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(probe.error).toBe('denied');
    expect(probe.errorMessage).toBe(LOCATE_DENIED_MESSAGE);
    expect(probe.canOpenSettings).toBe(false);
  });

  it('offers the Settings deep-link only after a SECOND denial', async () => {
    requestPermissionMock.mockResolvedValue({ status: 'denied' });

    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(false);

    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(true);
  });

  it('a grant after denials resets neither the flag nor the copy incorrectly', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    await locateAndFlush();
    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(true);

    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockResolvedValueOnce({ latitude: 1, longitude: 2, accuracy: 5 });
    const result = await locateAndFlush();

    expect(result).toEqual({ latitude: 1, longitude: 2 });
    expect(probe.error).toBeNull();
    expect(probe.errorMessage).toBeNull();
  });

  it('clearError resets the copy; openSettings delegates to Linking', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    await locateAndFlush();
    expect(probe.errorMessage).toBe(LOCATE_DENIED_MESSAGE);

    act(() => {
      probe.clearError();
    });
    expect(probe.errorMessage).toBeNull();

    act(() => {
      probe.openSettings();
    });
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('fix failures', () => {
  it('maps a timeout error message to the distinct timeout copy', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(new Error('Location request timed out'));

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.error).toBe('timeout');
    expect(probe.errorMessage).toBe(LOCATE_TIMEOUT_MESSAGE);
  });

  it('maps any other fix failure to the generic failure copy', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(new Error('Location services unavailable'));

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.error).toBe('failed');
    expect(probe.errorMessage).toBe(LOCATE_FAILED_MESSAGE);
  });
});
