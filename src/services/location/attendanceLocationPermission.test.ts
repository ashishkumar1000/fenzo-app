import { Platform, PermissionsAndroid, Linking } from 'react-native';
import {
  checkPermission,
  getAccuracyAuthorization,
  getProviderStatus,
  requestPermission,
} from 'react-native-nitro-geolocation';
import {
  resolveAttendanceLocationState,
  remediateAttendanceLocation,
} from './attendanceLocationPermission';

/**
 * Story 16-3 — the permission states (spec D3, layered
 * permission-BEFORE-accuracy). Tester stance: the states are the button's
 * vocabulary and each one renders a DIFFERENT remediation — the matrix
 * must survive OS changes, because a misclassified state either blocks a
 * legal user (denied shown as precise-off) or reaches a doomed capture
 * (denied shown as granted).
 */

const mockCheck = checkPermission as jest.Mock;
const mockAccuracy = getAccuracyAuthorization as jest.Mock;
const mockProviderStatus = getProviderStatus as jest.Mock;
const mockRequestPermission = requestPermission as jest.Mock;
const mockOpenSettings = Linking.openSettings as jest.Mock;

/** Platform.OS is consumed at call time — flipping it per test keeps one
 *  import graph. Saved/restored so the suite never leaks an OS. */
const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

/** Spies over the real PermissionsAndroid surface (a cast to jest.Mock
 *  would lie — the RN functions are not mocks). */
let fineCheckSpy: jest.SpyInstance;
let requestSpy: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  useOs('android');
  // Healthy defaults: services on, fine granted (the common case).
  mockProviderStatus.mockResolvedValue({ locationServicesEnabled: true });
  fineCheckSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  requestSpy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
});

afterAll(() => {
  fineCheckSpy.mockRestore();
  requestSpy.mockRestore();
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
});

describe('resolveAttendanceLocationState — Android (permission-first, spec D3)', () => {
  it('fine granted → granted (accuracy is never even consulted on Android)', async () => {
    await expect(resolveAttendanceLocationState()).resolves.toBe('granted');
    expect(mockAccuracy).not.toHaveBeenCalled();
  });

  it('coarse only (fine revoked by the OS "Approximate" toggle) → preciseOff — its OWN state', async () => {
    fineCheckSpy.mockReset();
    fineCheckSpy
      .mockResolvedValueOnce(false) // fine — revoked
      .mockResolvedValueOnce(true); // coarse — still granted

    await expect(resolveAttendanceLocationState()).resolves.toBe('preciseOff');
  });

  it('neither permission → denied (coarse also rejected)', async () => {
    fineCheckSpy.mockReset();
    fineCheckSpy
      .mockResolvedValueOnce(false) // fine
      .mockResolvedValueOnce(false); // coarse

    await expect(resolveAttendanceLocationState()).resolves.toBe('denied');
  });

  it('location SERVICES off → serviceOff even when permissions are granted (the master switch is the real problem)', async () => {
    mockProviderStatus.mockResolvedValue({ locationServicesEnabled: false });

    await expect(resolveAttendanceLocationState()).resolves.toBe('serviceOff');
  });

  it('a provider-status failure must not block the permission answer (fail over to the permission checks)', async () => {
    mockProviderStatus.mockRejectedValue(new Error('boom'));

    await expect(resolveAttendanceLocationState()).resolves.toBe('granted');
  });
});

describe('resolveAttendanceLocationState — iOS matrix', () => {
  it('granted + full accuracy → granted', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('granted');
    mockAccuracy.mockResolvedValue('full');

    await expect(resolveAttendanceLocationState()).resolves.toBe('granted');
  });

  it('granted + reduced accuracy → preciseOff (iOS "Precise Off" is its own state, addendum C2)', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('granted');
    mockAccuracy.mockResolvedValue('reduced');

    await expect(resolveAttendanceLocationState()).resolves.toBe('preciseOff');
  });

  it('permission denied → denied (NOT preciseOff — iOS reports reduced for denied users too; the review finding)', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('denied');
    mockAccuracy.mockResolvedValue('reduced');

    await expect(resolveAttendanceLocationState()).resolves.toBe('denied');
    // Layered: accuracy is never consulted for a denied user.
    expect(mockAccuracy).not.toHaveBeenCalled();
  });

  it('restricted (parental controls) → denied — Settings is the only path', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('restricted');

    await expect(resolveAttendanceLocationState()).resolves.toBe('denied');
  });

  it('pre-iOS-14 accuracy "unknown" → granted (let a failing capture surface the truth, never block the OS-unclassifiable)', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('granted');
    mockAccuracy.mockResolvedValue('unknown');

    await expect(resolveAttendanceLocationState()).resolves.toBe('granted');
  });

  it('undetermined is treated as denied at PROBE time — the remediation owns the first prompt', async () => {
    useOs('ios');
    mockCheck.mockResolvedValue('undetermined');

    await expect(resolveAttendanceLocationState()).resolves.toBe('denied');
  });
});

describe('remediateAttendanceLocation — the right flow per state', () => {
  it('Android denied → the OS request; granted → re-resolved state, no Settings', async () => {
    requestSpy.mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.GRANTED,
    );

    await expect(remediateAttendanceLocation('denied')).resolves.toBe('granted');
    expect(requestSpy).toHaveBeenCalled();
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });

  it('Android denied again (NEVER_ASK_AGAIN answer) → Settings (the OS may never prompt again)', async () => {
    requestSpy.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);

    await remediateAttendanceLocation('denied');
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('preciseOff → straight to Settings (the in-app prompt cannot fix granularity)', async () => {
    await remediateAttendanceLocation('preciseOff');
    expect(requestSpy).not.toHaveBeenCalled();
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('iOS denied → one in-app prompt attempt (covers the never-asked case), then Settings in the same tap', async () => {
    useOs('ios');
    mockRequestPermission.mockResolvedValueOnce('denied');

    await remediateAttendanceLocation('denied');
    expect(mockRequestPermission).toHaveBeenCalled();
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('iOS undetermined → the prompt SHOWS; granted → re-resolved, no Settings', async () => {
    useOs('ios');
    mockRequestPermission.mockResolvedValueOnce('granted');
    mockCheck.mockResolvedValue('granted');
    mockAccuracy.mockResolvedValue('full');

    await expect(remediateAttendanceLocation('denied')).resolves.toBe('granted');
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });
});
