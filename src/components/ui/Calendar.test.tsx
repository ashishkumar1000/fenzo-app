/**
 * Tests for the DS `Calendar` primitive (Story 15-6): the wrapper around
 * `react-native-ui-datepicker` that pins the Fenzit theme and exposes a
 * stable YYYY-MM-DD string API. These tests pin the behavioural contract:
 *
 *  - The wrapper passes `mode="single"` and anchors on the `today` prop
 *    when no value is set.
 *  - Every change emits a YYYY-MM-DD string in the device-local date
 *    (no UTC roll-over), regardless of the library's polymorphic value
 *    (Date | bare ISO string | ISO-with-time | dayjs).
 *  - Uninterpretable values (garbage, impossible calendar dates, invalid
 *    Dates) no-op — the wrapper never fabricates a date from the device
 *    clock and never emits NaN (15-6 review).
 *  - `framed` (default) wraps the library in the DS surface card;
 *    `framed=false` renders it bare (used inside sheets/screens that
 *    already provide their own surface).
 *  - `minDate`/`maxDate` are forwarded to the library as Date objects.
 *
 * Every `create` runs inside `act`: react-test-renderer leaves the tree
 * unmounted otherwise, and `renderer.root` throws
 * "Can't access .root on unmounted test renderer".
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import RNCDateTimePicker from 'react-native-ui-datepicker';
import { Calendar } from './Calendar';
import { colors } from '../../theme';

type CalendarProps = React.ComponentProps<typeof Calendar>;

function renderCalendar(props: CalendarProps): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Calendar {...props} />);
  });
  return renderer;
}

/** Find the underlying library element and read the props it received. */
function libraryProps(renderer: ReactTestRenderer.ReactTestRenderer) {
  const el = renderer.root.findByType(RNCDateTimePicker);
  return el.props as unknown as {
    mode: string;
    date: Date;
    minDate?: Date;
    maxDate?: Date;
    onChange: (p: { date: unknown }) => void;
  };
}

/** The wrapper View directly above the library — owns the `framed` card. */
function framedWrapperStyle(
  renderer: ReactTestRenderer.ReactTestRenderer,
): Record<string, unknown> {
  const wrapper = renderer.root.findByType(RNCDateTimePicker).parent;
  expect(wrapper).not.toBeNull();
  return (StyleSheet.flatten(
    (wrapper as { props: { style?: StyleProp<ViewStyle> } }).props.style,
  ) ?? {}) as Record<string, unknown>;
}

describe('Calendar', () => {
  const TODAY = '2026-09-27';

  it('renders the underlying library with mode="single"', () => {
    const renderer = renderCalendar({ today: TODAY, onChange: jest.fn() });
    expect(libraryProps(renderer).mode).toBe('single');
  });

  it('anchors the month on the value when set and well-formed', () => {
    const renderer = renderCalendar({
      value: '2026-12-15',
      today: TODAY,
      onChange: jest.fn(),
    });
    const d = libraryProps(renderer).date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // Dec (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it('falls back to the today anchor when no value is set', () => {
    const renderer = renderCalendar({ today: TODAY, onChange: jest.fn() });
    const d = libraryProps(renderer).date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // Sep
    expect(d.getDate()).toBe(27);
  });

  it('forwards minDate / maxDate as local-noon Date objects (string preserved)', () => {
    const renderer = renderCalendar({
      today: TODAY,
      onChange: jest.fn(),
      minDate: '2026-09-27',
      maxDate: '2026-12-31',
    });
    const lp = libraryProps(renderer);
    expect(lp.minDate?.getFullYear()).toBe(2026);
    expect(lp.minDate?.getMonth()).toBe(8);
    expect(lp.minDate?.getDate()).toBe(27);
    expect(lp.maxDate?.getFullYear()).toBe(2026);
    expect(lp.maxDate?.getMonth()).toBe(11);
    expect(lp.maxDate?.getDate()).toBe(31);
    // Noon anchor — avoids any DST edge where midnight would roll to the
    // previous day. The literal hour is internal, but a 12:00 anchor means
    // getDate() never depends on the runtime TZ.
    expect(lp.minDate?.getHours()).toBe(12);
    expect(lp.maxDate?.getHours()).toBe(12);
  });

  it('omits minDate/maxDate when not passed', () => {
    const renderer = renderCalendar({ today: TODAY, onChange: jest.fn() });
    const lp = libraryProps(renderer);
    expect(lp.minDate).toBeUndefined();
    expect(lp.maxDate).toBeUndefined();
  });

  it('a library onChange emits a YYYY-MM-DD string in local time', () => {
    const onChange = jest.fn();
    const renderer = renderCalendar({ today: TODAY, onChange });
    const lp = libraryProps(renderer);
    act(() => {
      lp.onChange({ date: new Date(2026, 8, 28, 15, 0, 0) }); // Sep 28 local
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-09-28');
  });

  it('a library onChange with a no-op date does NOT call back', () => {
    const onChange = jest.fn();
    const renderer = renderCalendar({ today: TODAY, onChange });
    const lp = libraryProps(renderer);
    act(() => {
      lp.onChange({ date: null as unknown as Date });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders without throwing when framed=false (sheet-embedded)', () => {
    expect(() =>
      renderCalendar({ today: TODAY, onChange: jest.fn(), framed: false }),
    ).not.toThrow();
  });
});
