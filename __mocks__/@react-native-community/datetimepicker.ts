/**
 * Manual jest mock for @react-native-community/datetimepicker (the root
 * __mocks__ dir is picked up automatically for node_modules packages —
 * the netinfo precedent). The real package boots native TurboModules and
 * its Android entry opens the OS dialog; neither can exist in jest.
 * Faked:
 *  - default export: the declarative component stub (records its latest
 *    props — the iOS spinner path);
 *  - DateTimePickerAndroid: the imperative API (records the latest `open`
 *    args — the Android path — so tests can invoke onValueChange/onDismiss
 *    exactly as the native dialog would).
 *
 * The seams are PLAIN functions, not jest.fn — suites call
 * jest.resetAllMocks() in beforeEach, which would strip a jest.fn's
 * implementation mid-suite.
 */
let lastProps: Record<string, unknown> | null = null;
let lastAndroidArgs: Record<string, unknown> | null = null;

const TimePickerMock = (props: Record<string, unknown>): null => {
  lastProps = props;
  return null;
};

const DateTimePickerAndroid = {
  open: (args: Record<string, unknown>): void => {
    lastAndroidArgs = args;
  },
  dismiss: (): void => {},
};

/** Test helper: the props of the most recent stub render (null if never). */
export function __getLastTimePickerProps(): Record<string, unknown> | null {
  return lastProps;
}

/** Test helper: the args of the most recent Android open (null if never). */
export function __getLastAndroidOpenArgs(): Record<string, unknown> | null {
  return lastAndroidArgs;
}

/** Test helper: forget everything recorded. */
export function __resetTimePickerMock(): void {
  lastProps = null;
  lastAndroidArgs = null;
}

export { DateTimePickerAndroid };
export default TimePickerMock;
