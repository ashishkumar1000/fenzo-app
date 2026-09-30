/**
 * Tests for the DS `TimeField` (Story 18-4 §10, D-TP1/D-TP4 + the triage
 * patches): the labeled tap-to-open time field. The package is mocked at
 * the root __mocks__ (the explicit jest.mock pins the intent here):
 *  - Android: the IMPERATIVE DateTimePickerAndroid.open(args) is recorded;
 *    tests fire the REAL v9 callback shape at the recorded args
 *    (onValueChange({nativeEvent:{timestamp,utcOffset}}, pickedDate) /
 *    onDismiss()) — the dialog itself can't exist in jest.
 *  - iOS: the declarative stub renders inside the (always-mounted) Sheet;
 *    tests drive onValueChange (commits live) and Done/onDismiss (closes).
 *
 * Pins: label/value/error/helper slots; the anchored Date (FIXED year-2000
 * date carrying only the hours+minutes); commit formatting to zero-padded
 * "HH:mm"; dismiss commits nothing; the Clear action (clearable optional
 * times — empty MEANS removal on the 18-2 wire); the a11y contract. The
 * jest preset resolves Platform.OS as 'ios' — the Android branch swaps it
 * directly (the photoPicker.test idiom).
 */
jest.mock('@react-native-community/datetimepicker');

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Platform, Text } from 'react-native';
import TimePickerStub, {
  DateTimePickerAndroid,
  // The root __mocks__ module carries these mock-only helpers; the real
  // package's types do not.
  // @ts-expect-error — mock-only named exports
  __getLastAndroidOpenArgs,
  // @ts-expect-error — mock-only named exports
  __getLastTimePickerProps,
  // @ts-expect-error — mock-only named exports
  __resetTimePickerMock,
} from '@react-native-community/datetimepicker';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { TimeField } from './TimeField';

const realOs = Platform.OS;

function renderField(
  props: React.ComponentProps<typeof TimeField>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<TimeField {...props} />);
  });
  return renderer;
}

/** The field row's Pressable: role button + onPress + our a11y label
 *  (the composite Pressable is mirrored by a host View in the test tree,
 *  so require an onPress — only the composite carries one). */
function findFieldButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(matches.length).toBeGreaterThanOrEqual(1);
  return matches[0];
}

/** The "Clear" action: role button whose a11y label starts with "Clear".
 *  The onPress requirement collapses the RTR host mirrors (the findFieldButton idiom). */
function findClearButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Clear'),
  );
}

function stubs(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(TimePickerStub as never);
}

function sheetVisible(renderer: ReactTestRenderer.ReactTestRenderer): boolean {
  const sheets = renderer.root.findAllByType(Sheet as never);
  expect(sheets.length).toBe(1);
  return Boolean(sheets[0].props.visible);
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

beforeEach(() => {
  Platform.OS = realOs;
  __resetTimePickerMock();
});

afterEach(() => {
  Platform.OS = realOs;
});

describe('TimeField', () => {
  it('renders label, value, error INSTEAD of helper; nothing open', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
      placeholder: '09:00',
      error: 'Check-out must be after check-in',
      helper: 'Pick a check-in time',
    });
    const shown = texts(renderer);
    expect(shown).toContain('Check-in time');
    expect(shown).toContain('08:57');
    expect(shown).toContain('Check-out must be after check-in');
    // Error replaces helper (the Input anatomy).
    expect(shown).not.toContain('Pick a check-in time');
  });

  it('the helper renders when there is no error', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '',
      onChangeValue: jest.fn(),
      helper: 'Pick a check-in time',
    });
    expect(texts(renderer)).toContain('Pick a check-in time');
  });

  it('ANDROID: a press opens the imperative dialog anchored at the value', () => {
    Platform.OS = 'android';
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
    });
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    const args = __getLastAndroidOpenArgs() as unknown as {
      value: Date;
      mode: string;
      is24Hour: boolean;
    };
    expect(args.mode).toBe('time');
    expect(args.is24Hour).toBe(true);
    expect(args.value.getFullYear()).toBe(2000);
    expect(args.value.getHours()).toBe(8);
    expect(args.value.getMinutes()).toBe(57);
  });

  it('ANDROID: an empty value anchors at the placeholder, else 09:00', () => {
    Platform.OS = 'android';
    const withPlaceholder = renderField({
      label: 'Start time',
      value: '',
      onChangeValue: jest.fn(),
      placeholder: '18:00',
    });
    act(() => {
      findFieldButton(withPlaceholder).props.onPress();
    });
    let args = __getLastAndroidOpenArgs() as unknown as { value: Date };
    expect(args.value.getHours()).toBe(18);
    expect(args.value.getMinutes()).toBe(0);

    const bare = renderField({
      label: 'Start time',
      value: '',
      onChangeValue: jest.fn(),
    });
    act(() => {
      findFieldButton(bare).props.onPress();
    });
    args = __getLastAndroidOpenArgs() as unknown as { value: Date };
    expect(args.value.getHours()).toBe(9);
    expect(args.value.getMinutes()).toBe(0);
  });

  it('ANDROID: the picked Date commits the zero-padded HH:mm via onValueChange', () => {
    Platform.OS = 'android';
    const onChangeValue = jest.fn();
    const renderer = renderField({
      label: 'Check-in time',
      value: '',
      onChangeValue,
      placeholder: '09:00',
    });
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    const args = __getLastAndroidOpenArgs() as unknown as {
      onValueChange: (event: unknown, date: Date) => void;
    };
    // The REAL v9 imperative shape: the picked Date as the second arg
    // (20:05 device-local).
    act(() => {
      args.onValueChange(
        { nativeEvent: { timestamp: 0, utcOffset: 0 } },
        new Date(2026, 8, 29, 20, 5, 0),
      );
    });
    expect(onChangeValue).toHaveBeenCalledTimes(1);
    expect(onChangeValue).toHaveBeenCalledWith('20:05');
  });

  it('ANDROID: onDismiss commits nothing', () => {
    Platform.OS = 'android';
    const onChangeValue = jest.fn();
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue,
    });
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    const args = __getLastAndroidOpenArgs() as unknown as { onDismiss: () => void };
    expect(typeof args.onDismiss).toBe('function');
    act(() => {
      args.onDismiss();
    });
    expect(onChangeValue).not.toHaveBeenCalled();
  });

  it('iOS: the press opens the Sheet; "set" commits live while spinning; Done closes', () => {
    const onChangeValue = jest.fn();
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue,
    });
    expect(sheetVisible(renderer)).toBe(false);
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(sheetVisible(renderer)).toBe(true);

    const props = __getLastTimePickerProps() as unknown as {
      onValueChange: (event: unknown, date: Date) => void;
      value: Date;
    };
    expect(props.value.getHours()).toBe(8);
    act(() => {
      props.onValueChange(
        { nativeEvent: { timestamp: 0, utcOffset: 0 } },
        new Date(2000, 0, 1, 6, 30, 0),
      );
    });
    expect(onChangeValue).toHaveBeenCalledWith('06:30');
    // The spinner is still up — only Done closes it.
    expect(sheetVisible(renderer)).toBe(true);

    const done = renderer.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Done');
    expect(done).toBeTruthy();
    act(() => {
      done!.props.onPress();
    });
    expect(sheetVisible(renderer)).toBe(false);
  });

  it('CLEAR: a filled clearable field offers the action; pressing empties it', () => {
    const onChangeValue = jest.fn();
    const renderer = renderField({
      label: 'Check-out time (optional)',
      value: '18:00',
      onChangeValue,
      clearable: true,
    });
    const clears = findClearButton(renderer);
    expect(clears).toHaveLength(1);
    expect(clears[0].props.accessibilityLabel).toBe(
      'Clear Check-out time (optional)',
    );
    act(() => {
      clears[0].props.onPress();
    });
    expect(onChangeValue).toHaveBeenCalledWith('');
  });

  it('CLEAR: an empty clearable field and a non-clearable field offer no action', () => {
    const empty = renderField({
      label: 'Check-out time (optional)',
      value: '',
      onChangeValue: jest.fn(),
      clearable: true,
      placeholder: '18:00',
    });
    expect(findClearButton(empty)).toHaveLength(0);

    const required = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
    });
    expect(findClearButton(required)).toHaveLength(0);
  });

  it('carries the a11y contract: role button, "{label}, {value}" label, open hint', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
      placeholder: '09:00',
    });
    const btn = findFieldButton(renderer);
    expect(btn.props.accessibilityLabel).toBe('Check-in time, 08:57');
    expect(btn.props.accessibilityHint).toBe('Opens the time picker.');
  });

  it('an empty value shows the placeholder in the row and in the a11y label', () => {
    const renderer = renderField({
      label: 'Check-out time (optional)',
      value: '',
      onChangeValue: jest.fn(),
      placeholder: '18:00',
    });
    expect(texts(renderer)).toContain('18:00');
    expect(findFieldButton(renderer).props.accessibilityLabel).toBe(
      'Check-out time (optional), 18:00',
    );
  });
});
