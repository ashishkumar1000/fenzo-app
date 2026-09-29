/**
 * Manual jest mock for @react-native-community/netinfo (root __mocks__ dir
 * is picked up automatically for node_modules packages). The real module
 * needs RNCNetInfo, a native TurboModule that can't exist in jest. Only
 * what the app consumes is faked: a default export shaped like the real
 * NetInfo (addEventListener returning an unsubscribe + a fetch resolving
 * online) and nothing else.
 *
 * The seams are PLAIN functions, not jest.fn — suites call
 * jest.resetAllMocks() in beforeEach, which would strip a jest.fn's
 * implementation and leave fetch() returning undefined mid-suite. Tests
 * that need to assert on or override connectivity mock the module
 * themselves with jest.mock.
 */
import type { NetInfoState } from '@react-native-community/netinfo';

const ONLINE = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
} as NetInfoState;

let currentState: NetInfoState = ONLINE;
const listeners = new Set<(state: NetInfoState) => void>();

const NetInfoMock = {
  fetch: (): Promise<NetInfoState> => Promise.resolve(currentState),
  addEventListener: (listener: (state: NetInfoState) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  configure: (): void => undefined,
  refresh: (): Promise<NetInfoState> => Promise.resolve(currentState),
};

/** Test helper: set what fetch()/listeners see (and notify listeners). */
export function __setNetInfoState(state: NetInfoState): void {
  currentState = state;
  for (const listener of listeners) listener(state);
}

/** Test helper: back to online, listeners cleared. */
export function __resetNetInfoMock(): void {
  currentState = ONLINE;
  listeners.clear();
}

export default NetInfoMock;
