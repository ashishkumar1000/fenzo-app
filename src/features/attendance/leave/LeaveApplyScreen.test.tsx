/**
 * Screen tests for `LeaveApplyScreen` (Story 17-5, spec §4) — composition
 * only; the hook is mocked (its behaviour is pinned in useLeaveApply.test).
 * Pins: the mockup Frame A anatomy ORDER (Type → Dates → Reason → footer);
 * the reason counter's amber flip at ≥450; the reset note rendering UNDER
 * the Type control; the Clear affordance only when To is filled; the
 * InlineError slot above the footer button; the count chip's live region
 * and in-flight dim; a Dynamic-Type reflow smoke (nothing disables font
 * scaling); a11y labels/roles. The Attendance tab's entry row is pinned
 * here too (active + upcoming render it; history_only/none never do), per
 * §4's test plan.
 *
 * RTR gotchas honoured (spec §4): Text children may be JSX arrays, so all
 * text matching flattens; pressables are found by type + role props, never
 * findAllByProps with asymmetric matchers; Button double-carries onPress
 * onto its inner Pressable, so the submit button is found BY TYPE; state
 * changes are driven via props on a fresh root.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('./useLeaveApply', () => ({
  useLeaveApply: jest.fn(),
}));

jest.mock('../me/attendanceAccessStore', () => ({
  useAttendanceAccess: jest.fn(),
  refreshAttendanceAccessOnFocus: jest.fn(),
  refreshAttendanceAccessNow: jest.fn(),
}));

// Story 17-6: this suite renders AttendanceTabScreen (the entry-row pins
// below), whose Leave section now fetches the history. The suite renders
// SYNCHRONOUSLY, so the GET is armed PENDING — a resolving promise would
// settle after the tests and its setState would land outside act.
jest.mock('../../../services', () => ({
  ...jest.requireActual('../../../services'),
  attendanceLeaveService: {
    listMyLeave: jest.fn(() => new Promise(() => undefined)),
  },
}));

jest.mock('../me/useAttendanceSummary', () => ({
  useAttendanceSummary: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, InlineError, InlineNotice, SegmentedControl } from '../../../components/ui';
import { colors } from '../../../theme';
import { formatLongDate } from '../../../utils';
import { useLeaveApply } from './useLeaveApply';
import { useAttendanceAccess } from '../me/attendanceAccessStore';
import { useAttendanceSummary } from '../me/useAttendanceSummary';
import type { AttendanceSummaryState } from '../me/useAttendanceSummary';
import type { AttendanceAccessStateSnapshot } from '../me/attendanceAccessStore';
import type { AttendanceSummary } from '../../../services';
import LeaveApplyScreen from './LeaveApplyScreen';
import AttendanceTabScreen from '../me/AttendanceTabScreen';

const useLeaveApplyMock = useLeaveApply as jest.Mock;
const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;
const useAttendanceSummaryMock = useAttendanceSummary as jest.Mock;

type Hook = ReturnType<typeof useLeaveApply>;

function leaveState(overrides: Partial<Hook> = {}): Hook {
  return {
    today: '2026-10-01',
    from: null,
    to: null,
    part: 'full_day',
    reason: '',
    setReason: jest.fn(),
    typeOptions: [
      { value: 'full_day', label: 'Full day' },
      { value: 'first_half', label: 'First half' },
      { value: 'second_half', label: 'Second half' },
    ],
    resetNote: false,
    preview: { status: 'idle', workingDays: null, message: null },
    canSubmit: false,
    submitting: false,
    footerError: null,
    changePart: jest.fn(),
    clearTo: jest.fn(),
    openFromPicker: jest.fn(),
    openToPicker: jest.fn(),
    submit: jest.fn(),
    ...overrides,
  };
}

const SUBMIT_LABEL = 'Submit for approval';

/** Flattens a Text node's children — JSX arrays defeat exact matchers. */
function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function textsInOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function firstIndexOf(texts: string[], needle: string): number {
  const at = texts.indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  return at;
}

/**
 * The row Pressable. `findAllByType(Pressable)` is unreliable here — the
 * composite Pressable is mirrored by its host View in the test tree — so
 * the DatePickerField.test house finder: a button-role node carrying an
 * onPress and the row's own label (only the composite carries onPress).
 */
function findButtons(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance[] {
  return root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
  );
}

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn(() => jest.fn()),
    getParent: jest.fn(() => null),
    canGoBack: jest.fn(() => true),
  };
}

type Nav = ReturnType<typeof makeNavigation>;

function renderScreen(state: Hook = leaveState()): {
  root: ReactTestRenderer.ReactTestInstance;
  renderer: ReactTestRenderer.ReactTestRenderer;
  navigation: Nav;
} {
  const navigation = makeNavigation();
  useLeaveApplyMock.mockReturnValue(state);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const element = (nav: unknown) => (
    <LeaveApplyScreen navigation={nav as never} route={{ params: { today: '2026-10-01', pickedDate: null, context: null } } as never} />
  );
  act(() => {
    renderer = create(element(navigation));
  });
  return { root: renderer.root, renderer, navigation };
}

describe('the mockup Frame A anatomy (spec D2)', () => {
  it('renders every block in reading order: header → Type → Dates → Reason → footer', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: { status: 'ok', workingDays: 3, message: null },
      }),
    );
    const texts = textsInOrder(root);
    const header = firstIndexOf(texts, 'Apply for leave');
    const type = firstIndexOf(texts, 'Type');
    const fullDay = firstIndexOf(texts, 'Full day');
    const dates = firstIndexOf(texts, 'Dates');
    const from = firstIndexOf(texts, 'From');
    const to = firstIndexOf(texts, 'To');
    const count = firstIndexOf(texts, '3 working days');
    const reason = firstIndexOf(texts, 'Reason (required)');
    const counter = texts.findIndex(t => t === '0 / 500');
    const submit = firstIndexOf(texts, SUBMIT_LABEL);

    expect(header).toBeLessThan(type);
    expect(type).toBeLessThan(fullDay);
    expect(fullDay).toBeLessThan(dates);
    expect(dates).toBeLessThan(from);
    expect(from).toBeLessThan(to);
    expect(to).toBeLessThan(count);
    expect(count).toBeLessThan(reason);
    expect(reason).toBeLessThan(counter);
    expect(counter).toBeLessThan(submit);
  });

  it('the empty count keeps the rhythm with the muted hint line', () => {
    const { root } = renderScreen();
    expect(
      textsInOrder(root).includes('Pick dates to see the working-days count.'),
    ).toBe(true);
  });

  it('the hint shows only for the empty state — not while a preview loads with From set', () => {
    // Review regression (contract-hunter LOW): the "Pick dates…" copy is
    // wrong the moment a date exists; the first GET renders nothing there.
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: { status: 'loading', workingDays: null, message: null },
      }),
    );
    expect(
      textsInOrder(root).includes('Pick dates to see the working-days count.'),
    ).toBe(false);
  });

  it('the To row is gated on From (disabled until a From exists)', () => {
    const { root } = renderScreen();
    const fromRows = findButtons(root, 'From: not selected, tap to pick');
    const toRows = findButtons(root, 'To: not selected, tap to pick');
    expect(fromRows).toHaveLength(1);
    expect(toRows).toHaveLength(1);
    expect(fromRows[0].props.accessibilityState).toEqual({ disabled: false });
    expect(toRows[0].props.accessibilityState).toEqual({ disabled: true });
  });
});

describe('the count chip (spec D4)', () => {
  it('renders the server integer verbatim with the polite live region', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: { status: 'ok', workingDays: 1, message: null },
      }),
    );
    expect(textsInOrder(root).includes('1 working day')).toBe(true);
    const chip = root.findAll(
      n => typeof n.type === 'string' && n.props.accessibilityLiveRegion === 'polite',
    );
    expect(chip).toHaveLength(1);
  });

  it('an in-flight GET dims the previous value in place (opacity 0.6, no spinner)', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: { status: 'loading', workingDays: 3, message: null },
      }),
    );
    expect(textsInOrder(root).includes('3 working days')).toBe(true);
    const chip = root.findAll(
      n => typeof n.type === 'string' && n.props.accessibilityLiveRegion === 'polite',
    );
    expect(chip).toHaveLength(1);
    const styles = Array.isArray(chip[0].props.style)
      ? chip[0].props.style
      : [chip[0].props.style];
    expect(styles.some(s => s && s.opacity === 0.6)).toBe(true);
  });

  it('ok:false replaces the chip with an amber info notice carrying the server message', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: {
          status: 'rejected',
          workingDays: null,
          message: 'These days are already off',
        },
      }),
    );
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.tone).toBe('info');
    expect(notices[0].props.message).toBe('These days are already off');
  });

  it('a transport failure renders the neutral notice', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        preview: {
          status: 'transport',
          workingDays: null,
          message: "Couldn't update the working-days count. Check your connection.",
        },
      }),
    );
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.tone).toBe('neutral');
  });
});

describe('the Type block and its reset note (spec D3)', () => {
  it('a range collapses the control to a single Full day segment', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        to: '2026-10-09',
        typeOptions: [{ value: 'full_day', label: 'Full day' }],
      }),
    );
    const controls = root.findAllByType(SegmentedControl);
    expect(controls).toHaveLength(1);
    expect(controls[0].props.options).toEqual([
      { value: 'full_day', label: 'Full day' },
    ]);
  });

  it('the reset note renders UNDER the Type control, before the Dates section', () => {
    const { root } = renderScreen(leaveState({ resetNote: true }));
    const texts = textsInOrder(root);
    const note = firstIndexOf(
      texts,
      'Leave type reset to Full day — half day applies to a single date only.',
    );
    expect(firstIndexOf(texts, 'Full day')).toBeLessThan(note);
    expect(note).toBeLessThan(firstIndexOf(texts, 'Dates'));
  });

  it('no reset note without the flag', () => {
    const { root } = renderScreen();
    expect(root.findAllByType(InlineNotice)).toHaveLength(0);
  });
});

describe('the To row Clear affordance (spec D3)', () => {
  it('absent while To is empty', () => {
    const { root } = renderScreen();
    expect(findButtons(root, 'Clear to')).toHaveLength(0);
  });

  it('present only when To is filled, wired to the hook clear', () => {
    const clearTo = jest.fn();
    const { root } = renderScreen(
      leaveState({ from: '2026-10-05', to: '2026-10-09', clearTo }),
    );
    const clears = findButtons(root, 'Clear to');
    expect(clears).toHaveLength(1);
    expect(clears[0].props.onPress).toBe(clearTo);
  });
});

describe('the reason counter (spec D2)', () => {
  it('muted below the near-limit threshold', () => {
    const { root } = renderScreen(leaveState({ reason: 'Family event' }));
    const counter = root
      .findAllByType(Text)
      .find(n => flatText(n) === '12 / 500');
    expect(counter).toBeDefined();
    const styles = Array.isArray(counter!.props.style)
      ? counter!.props.style
      : [counter!.props.style];
    expect(styles.some(s => s && s.color === colors.textMuted)).toBe(true);
    expect(
      styles.some(s => s && s.color === colors.status.scheduled.fg),
    ).toBe(false);
  });

  it('flips amber at n ≥ 450', () => {
    const { root } = renderScreen(leaveState({ reason: 'x'.repeat(450) }));
    const counter = root
      .findAllByType(Text)
      .find(n => flatText(n) === '450 / 500');
    expect(counter).toBeDefined();
    const styles = Array.isArray(counter!.props.style)
      ? counter!.props.style
      : [counter!.props.style];
    expect(styles.some(s => s && s.color === colors.status.scheduled.fg)).toBe(true);
  });
});

describe('the footer (spec D2/D5/D6)', () => {
  it('the submit button gates on the hook and loads while submitting', () => {
    const submit = jest.fn();
    const { root } = renderScreen(leaveState({ canSubmit: true, submit }));
    const button = root.findAllByType(Button).find(b => b.props.children === SUBMIT_LABEL);
    expect(button).toBeDefined();
    expect(button!.props.disabled).toBe(false);
    expect(button!.props.loading).toBe(false);
    expect(button!.props.size).toBe('lg');
    expect(button!.props.fullWidth).toBe(true);

    const gated = renderScreen(leaveState({ canSubmit: false }));
    const gatedButton = gated.root
      .findAllByType(Button)
      .find(b => b.props.children === SUBMIT_LABEL);
    expect(gatedButton!.props.disabled).toBe(true);
  });

  it('the InlineError slot renders in the footer, above the button', () => {
    const { root } = renderScreen(
      leaveState({ footerError: 'These days are already off', canSubmit: true }),
    );
    const errors = root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe('These days are already off');
    // Non-dismissible (D6): no onDismiss.
    expect(errors[0].props.onDismiss).toBeUndefined();
    // Footer order: error slot BEFORE the submit button.
    const all = root.findAll(n => true);
    expect(all.indexOf(errors[0])).toBeLessThan(
      all.indexOf(root.findAllByType(Button)[0]),
    );
  });

  it('no error slot while the message area is clear', () => {
    const { root } = renderScreen();
    expect(root.findAllByType(InlineError)).toHaveLength(0);
  });
});

describe('accessibility floor (spec D9)', () => {
  it('date rows carry label + state; the calendar icon is decorative (no text)', () => {
    const { root } = renderScreen(
      leaveState({ from: '2026-10-05', to: '2026-10-09' }),
    );
    const rows = findButtons(root, `From: ${formatLongDate('2026-10-05')}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].props.accessibilityRole).toBe('button');
  });

  it('Dynamic Type reflow smoke: nothing disables font scaling', () => {
    const { root } = renderScreen(
      leaveState({
        from: '2026-10-05',
        to: '2026-10-09',
        preview: { status: 'ok', workingDays: 3, message: null },
        resetNote: true,
      }),
    );
    expect(root.findAll(n => n.props.allowFontScaling === false)).toHaveLength(0);
  });
});

// --- The Attendance tab's Leave section (spec D1, §4's entry-row pins) ----

const TAB_SUMMARY: AttendanceSummary = {
  officeId: 'o1',
  officeName: 'HQ',
  startTime: '09:30',
  endTime: '18:00',
  lateCutOffMinutes: 15,
  weeklyOffDays: [6, 7],
  officeLatitude: 19.076,
  officeLongitude: 72.8777,
  today: {
    date: '2026-10-01',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
    leaveState: null,
    leavePart: null,
  },
};

function ready(
  attendanceAccess: 'active' | 'upcoming' | 'none' | 'history_only',
): AttendanceAccessStateSnapshot {
  return {
    status: 'ready',
    access: {
      attendanceEnabled: true,
      attendanceAccess,
      attendanceStartDate: '2026-11-01',
      attendanceEndedOn: null,
      enabledAt: '2026-09-28T10:00:00Z',
      onboardedAt: '2026-09-28T09:00:00Z',
      officeId: 'o1',
      officeName: 'HQ',
    },
  };
}

function summaryState(
  summary: AttendanceSummary | null,
): AttendanceSummaryState {
  return { summary, isLoading: false, error: null, isStale: false };
}

function renderTab(
  storeState: AttendanceAccessStateSnapshot,
  summary: AttendanceSummary | null,
) {
  const navigation = makeNavigation();
  useAttendanceAccessMock.mockReturnValue(storeState);
  useAttendanceSummaryMock.mockReturnValue({
    state: summaryState(summary),
    refresh: jest.fn(),
    refreshNow: jest.fn(),
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceTabScreen navigation={navigation as never} route={{} as never} />,
    );
  });
  return { root: renderer.root, navigation };
}

describe('the tab entry row (spec D1)', () => {
  it('renders in active and pushes LeaveApply with the summary today', () => {
    const { root, navigation } = renderTab(ready('active'), TAB_SUMMARY);
    const row = findButtons(root, 'Apply for leave');
    expect(row).toHaveLength(1);
    act(() => {
      row[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('LeaveApply', {
      today: '2026-10-01',
    });
  });

  it('renders in upcoming with today null (the wire has no today outside active)', () => {
    const { root, navigation } = renderTab(ready('upcoming'), {
      ...TAB_SUMMARY,
      today: undefined,
    });
    const row = findButtons(root, 'Apply for leave');
    expect(row).toHaveLength(1);
    act(() => {
      row[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('LeaveApply', {
      today: null,
    });
  });

  it('absent in history_only and none', () => {
    for (const state of [ready('history_only'), ready('none')]) {
      const { root } = renderTab(state, null);
      expect(findButtons(root, 'Apply for leave')).toHaveLength(0);
      expect(textsInOrder(root).includes('Apply for leave')).toBe(false);
    }
  });

  it('the Leave section head renders above the entry row', () => {
    const { root } = renderTab(ready('active'), TAB_SUMMARY);
    const texts = textsInOrder(root);
    expect(firstIndexOf(texts, 'Leave')).toBeLessThan(
      firstIndexOf(texts, 'Apply for leave'),
    );
  });
});
