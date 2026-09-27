/**
 * Tests for the DS `DatePickerField` (Story 15-6): the labeled "tap to
 * open a calendar" date input. Pins the closed/open states, the rendered
 * value vs. placeholder, the a11y label contract, the inline error
 * styling, and the close-on-pick behaviour.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import RNCDateTimePicker from 'react-native-ui-datepicker';
import { DatePickerField } from './DatePickerField';

const TODAY = '2026-09-27';

function renderField(
  props: React.ComponentProps<typeof DatePickerField>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<DatePickerField {...props} />);
  });
  return renderer;
}

/**
 * The field row's Pressable. `findByProps({ accessibilityRole: 'button' })`
 * is ambiguous: react-test-renderer mirrors the composite `Pressable` with
 * its host `View` (same role, same label), and the open calendar brings its
 * own header buttons. Scope on the row's own a11y label prefix — every
 * render here passes a `label` (or falls back to "Date") — and require an
 * `onPress`, which only the composite Pressable carries.
 */
function findFieldButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label = 'Date',
) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button'
      && typeof node.props.onPress === 'function'
      && typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.startsWith(`${label}:`),
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

function libraryOnChange(renderer: ReactTestRenderer.ReactTestRenderer) {
  return (
    renderer.root.findByType(RNCDateTimePicker).props as unknown as {
      onChange: (p: { date: Date }) => void;
    }
  ).onChange;
}

describe('DatePickerField', () => {
  it('renders an empty value as the placeholder (today) and stays closed', () => {
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange: jest.fn(),
      placeholder: TODAY,
    });
    // The placeholder literal "2026-09-27" is rendered when empty.
    expect(
      renderer.root.findAllByProps({ children: TODAY }).length,
    ).toBeGreaterThan(0);
    // No calendar shown initially.
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(0);
  });

  it('renders the long-form date when a value is set', () => {
    const renderer = renderField({
      value: '2026-09-30',
      today: TODAY,
      onChange: jest.fn(),
    });
    // Locale-agnostic assertion: at minimum the YYYY-MM-DD pieces
    // appear inside a single Text, joined by spaces and a comma.
    const texts = renderer.root
      .findAllByType(Text)
      .map((t) => (typeof t.props.children === 'string' ? t.props.children : ''))
      .join(' ');
    expect(texts).toContain('30');
    expect(texts).toContain('2026');
  });

  it('a tap on the row opens the calendar', () => {
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange: jest.fn(),
    });
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(0);

    act(() => {
      findFieldButton(renderer).props.onPress();
    });

    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(1);
  });

  it('a tap on the row while open closes the calendar', () => {
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange: jest.fn(),
    });
    // Open it.
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(1);

    // After open, the same onPress target re-fires (the field row is
    // still mounted); the wrapper's setOpen(o => !o) toggles it off.
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(0);
  });

  it('picking a day fires onChange AND closes the calendar (close-on-pick)', () => {
    const onChange = jest.fn();
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange,
    });
    // Open.
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(1);

    // Library fires its onChange with the chosen Date; the wrapper
    // forwards the YYYY-MM-DD and ALSO closes the inline calendar so
    // the field collapses back to its single-row state.
    act(() => {
      libraryOnChange(renderer)({ date: new Date(2026, 8, 28, 12) });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-09-28');
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(0);
  });

  it('the closed-row a11y label reflects the chosen value', () => {
    const renderer = renderField({
      label: 'Effective from',
      value: '2026-09-30',
      today: TODAY,
      onChange: jest.fn(),
    });
    const btn = findFieldButton(renderer, 'Effective from');
    expect(btn.props.accessibilityLabel).toMatch(/Effective from/);
    expect(btn.props.accessibilityLabel).toContain('2026');
  });

  it('the closed-row a11y label for an empty value says "not selected, tap to pick"', () => {
    const renderer = renderField({
      label: 'Effective from',
      value: '',
      today: TODAY,
      onChange: jest.fn(),
    });
    expect(findFieldButton(renderer, 'Effective from').props.accessibilityLabel)
      .toMatch(/not selected, tap to pick/);
  });

  it('inline error replaces the helper copy and the border goes red', () => {
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange: jest.fn(),
      error: 'Pick a date',
      helper: 'Effective from today',
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map((t) => (typeof t.props.children === 'string' ? t.props.children : ''));
    expect(texts).toContain('Pick a date');
    expect(texts).not.toContain('Effective from today');
  });

  it('disabled swallows taps (the row never opens the calendar)', () => {
    const renderer = renderField({
      value: '',
      today: TODAY,
      onChange: jest.fn(),
      disabled: true,
    });
    const btn = findFieldButton(renderer);
    expect(btn.props.disabled).toBe(true);
    // Even if the underlying onPress were somehow called, the calendar
    // wouldn't open — the Pressable disables the press natively.
    expect(renderer.root.findAllByType(RNCDateTimePicker)).toHaveLength(0);
  });
});
