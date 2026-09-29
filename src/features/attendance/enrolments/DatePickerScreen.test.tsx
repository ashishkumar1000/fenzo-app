/**
 * Screen tests for `DatePickerScreen`'s confirm routing (Story 17-6 review
 * P1): the confirm must pop back to the OPENER for every `returnTo` the
 * union now carries. The `ApplyOnBehalf` branch was missing — the pick fell
 * into the Enrolments fallback, dumped the owner on the roster and lost the
 * date. These tests drive the REAL confirm path (the apply-on-behalf
 * receiver suite fakes the merge via renderer.update, which masked it).
 *
 * The calendar itself is the library's — only the routing is pinned here.
 */
jest.mock('react-native-ui-datepicker', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (v: { date: unknown }) => void }) => {
      onChangeRef = onChange;
      return <Text>fake-calendar</Text>;
    },
  };
});

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Button } from '../../../components/ui';
import DatePickerScreen from './DatePickerScreen';

let onChangeRef: ((v: { date: unknown }) => void) | null = null;

const popTo = jest.fn();
const goBack = jest.fn();
const setParams = jest.fn();

function renderScreen(params: Record<string, unknown>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <DatePickerScreen
        // The dual-stack props type is an intersection; the test drives the
        // owner-stack shape.
        navigation={{ popTo, goBack, setParams } as never}
        route={{ key: 'datepicker', name: 'DatePicker', params } as never}
      />,
    );
  });
  return renderer;
}

function pickAndConfirm(r: ReactTestRenderer.ReactTestRenderer, date: unknown) {
  expect(typeof onChangeRef).toBe('function');
  act(() => {
    onChangeRef!({ date });
  });
  const confirm = r.root.findAllByType(Button)[0];
  act(() => {
    confirm.props.onPress();
  });
}

beforeEach(() => {
  onChangeRef = null;
  popTo.mockClear();
  goBack.mockClear();
  setParams.mockClear();
});

describe('the confirm routing per returnTo', () => {
  it('ApplyOnBehalf pops back to the on-behalf form, merging the pick (17-6 review P1)', () => {
    const renderer = renderScreen({
      title: 'Choose start date',
      value: null,
      today: undefined,
      minDate: '2026-09-22',
      maxDate: undefined,
      returnTo: 'ApplyOnBehalf',
      context: 'from',
    });
    pickAndConfirm(renderer, '2026-10-05');
    expect(popTo).toHaveBeenCalledTimes(1);
    expect(popTo).toHaveBeenCalledWith(
      'ApplyOnBehalf',
      { pickedDate: '2026-10-05', context: 'from' },
      { merge: true },
    );
    expect(goBack).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('LeaveApply keeps its own branch (17-5 behaviour unchanged)', () => {
    const renderer = renderScreen({
      title: 'Choose start date',
      value: null,
      today: '2026-10-01',
      minDate: '2026-09-24',
      maxDate: undefined,
      returnTo: 'LeaveApply',
      context: 'to',
    });
    pickAndConfirm(renderer, '2026-10-09');
    expect(popTo).toHaveBeenCalledWith(
      'LeaveApply',
      { pickedDate: '2026-10-09', context: 'to' },
      { merge: true },
    );
    renderer.unmount();
  });

  it('the Enrolments fallback is untouched for every other returnTo', () => {
    const renderer = renderScreen({
      title: 'Pick a date',
      value: '2026-10-01',
      returnTo: 'AttendanceEnrolments',
      context: 'start',
    });
    pickAndConfirm(renderer, '2026-10-02');
    expect(popTo).toHaveBeenCalledWith(
      'AttendanceEnrolments',
      { pickedDate: '2026-10-02', context: 'start' },
      { merge: true },
    );
    renderer.unmount();
  });

  it('confirm with no selected date is a no-op', () => {
    const renderer = renderScreen({
      title: 'Choose start date',
      value: null,
      returnTo: 'ApplyOnBehalf',
      context: 'from',
    });
    const confirm = renderer.root.findAllByType(Button)[0];
    act(() => {
      confirm.props.onPress();
    });
    expect(popTo).not.toHaveBeenCalled();
    renderer.unmount();
  });
});
