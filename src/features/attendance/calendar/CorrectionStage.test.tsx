/**
 * Stage tests for CorrectionStage (Story 18-4, spec §3 test plan + §10
 * D-TP2/D-TP4): the initial mode derivation (instants → Times; a status
 * grade / no row → Status); pre-fill from the carried instants' wall
 * times; the status pre-select (current grade when correctable, else
 * Present); values LIFTED above the mode switch (Times → Status → Times
 * keeps the picked times); the Save gate (note ≥ 1 after trim AND valid
 * times — the picker cannot emit a malformed value, so isValidTime is the
 * safety net only); the NEW ordering gate (check-out ≤ check-in blocks
 * client-side with the field's copy, always visible — no blur concept);
 * the XOR bodies (status arm; instants arm anchored to the work date with
 * the CARRIED offset, no checkout key when the pre-fill is empty); the
 * note counter (amber from 450, the RevokeSheet anatomy); the InlineError
 * slot; Back; the submitting posture. Times are set through the TimeField's
 * onChangeValue — the only mutation surface a picker field has. The
 * datetimepicker package is stubbed by the root __mocks__ module. Every
 * state-changing call is act-wrapped (the RevokeSheet idiom).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  Button,
  InlineError,
  Input,
  TimeField,
} from '../../../components/ui';
import { colors } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { CorrectionStage } from './CorrectionStage';

function row(overrides: Partial<DayStatusRow> = {}): DayStatusRow {
  return {
    workDate: '2026-09-15',
    status: 'present',
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: 488,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: 'o1',
    officeName: 'Andheri',
    checkinAt: '2026-09-15T09:35:00+05:30',
    checkoutAt: '2026-09-15T18:05:00+05:30',
    checkinSource: 'gps',
    checkoutSource: 'gps',
    checkinDistanceM: 12,
    checkoutDistanceM: 30,
    markers: [],
    ...overrides,
    // 20-1 — leaveRequestId normalizes AFTER the spread (Partial leaks
    // undefined through it); only the leave-day rows carry a UUID.
    leaveRequestId: overrides.leaveRequestId ?? null,

  };
}

type Props = Parameters<typeof CorrectionStage>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    workDate: '2026-09-15',
    day: row(),
    submitting: false,
    errorMessage: null,
    onBack: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
}

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderStage(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<CorrectionStage {...baseProps(props)} />);
  });
  renderers.push(renderer);
  return renderer.root;
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(child => (child == null ? '' : String(child))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** A picker time field by its label. */
function timeField(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const field = root.findAllByType(TimeField).find(f => f.props.label === label);
  if (field == null) throw new Error(`no time field labelled "${label}"`);
  return field;
}

/** The picker path: commit a "HH:mm" through onChangeValue. */
async function setTime(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  hhmm: string,
) {
  await act(async () => {
    timeField(root, label).props.onChangeValue(hhmm);
  });
}

/** The one still-typed field: the note. */
function noteField(
  root: ReactTestRenderer.ReactTestInstance,
): ReactTestRenderer.ReactTestInstance {
  const input = root.findAllByType(Input).find(i => i.props.label === 'Note (required)');
  if (input == null) throw new Error('no note input');
  return input;
}

async function typeInto(
  root: ReactTestRenderer.ReactTestInstance,
  text: string,
) {
  await act(async () => {
    noteField(root).props.onChangeText(text);
  });
}

function saveButton(root: ReactTestRenderer.ReactTestInstance) {
  const button = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Save correction');
  if (button == null) throw new Error('Save correction did not render');
  return button;
}

async function pressSave(root: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    saveButton(root).props.onPress();
  });
}

/** The joined label of a segmented option's pressable. */
function labelOf(node: ReactTestRenderer.ReactTestInstance): string {
  return node
    .findAll(t => t.type === Text)
    .map(flatText)
    .join('');
}

/** Presses a segmented option by walking up from its label Text. */
async function pressSegment(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const text = root.find(n => n.type === Text && flatText(n) === label);
  let node = text.parent;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error(`no segment "${label}"`);
  await act(async () => {
    node!.props.onPress();
  });
}

/** The selected segmented labels, deduped (a composite Pressable is
 *  mirrored by its host View in the test tree — the known quirk). */
function selectedSegments(root: ReactTestRenderer.ReactTestInstance): string[] {
  return [
    ...new Set(
      root
        .findAll(n => n.props.accessibilityState?.selected === true)
        .map(labelOf),
    ),
  ];
}

/** Flattened color of a Text node (styles may be arrays). */
function colorOf(node: ReactTestRenderer.ReactTestInstance): string | undefined {
  const style = Array.isArray(node.props.style)
    ? Object.assign({}, ...node.props.style)
    : node.props.style;
  return style?.color;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  while (renderers.length > 0) {
    const renderer = renderers.pop()!;
    act(() => renderer.unmount());
  }
});

describe('initial mode + pre-fill', () => {
  it('a day with instants opens in Times mode with the wall times pre-filled', async () => {
    const root = await renderStage();
    expect(texts(root)).toContain('Times');
    expect(texts(root)).toContain('Status');
    expect(timeField(root, 'Check-in time').props.value).toBe('09:35');
    expect(timeField(root, 'Check-out time (optional)').props.value).toBe('18:05');
    expect(texts(root)).not.toContain('Set day status');
  });

  it('a status-override day opens in Status mode with that grade pre-selected', async () => {
    const root = await renderStage({
      day: row({
        status: 'absent',
        checkinAt: null,
        checkoutAt: null,
        workedMinutes: null,
      }),
    });
    expect(texts(root)).toContain('Set day status');
    // The mode segment (Status) and the status segment (Absent) both carry
    // accessibilityState.selected.
    expect(selectedSegments(root)).toEqual(['Status', 'Absent']);
  });

  it('a NEXT-DAY checkout pre-fills EMPTY — its wall time cannot round-trip the workDate anchor (triage: the 422 trap)', async () => {
    const root = await renderStage({
      day: row({ checkoutAt: '2026-09-16T01:10:00+05:30' }),
    });
    expect(timeField(root, 'Check-in time').props.value).toBe('09:35');
    expect(timeField(root, 'Check-out time (optional)').props.value).toBe('');
  });

  it('the engine\'s past-absent (a non-override absent) also starts from Absent; a no-row day from Present', async () => {
    // absent is a correctable target, so it pre-selects itself...
    const engineAbsent = await renderStage({
      day: row({ status: 'absent', checkinAt: null, checkoutAt: null, workedMinutes: null }),
    });
    expect(selectedSegments(engineAbsent)).toContain('Absent');

    // ...while a no-row day cannot pre-select anything but Present.
    const noRow = await renderStage({ day: null });
    expect(selectedSegments(noRow)).toContain('Present');
  });

  it('a non-correctable grade (leave) pre-selects Present, never the wire-rejected grade', async () => {
    const root = await renderStage({
      day: row({ status: 'leave', checkinAt: null, checkoutAt: null, workedMinutes: null }),
    });
    const selected = selectedSegments(root);
    expect(selected).toContain('Present');
    expect(selected).not.toContain('Leave');
  });
});

describe('lifted values survive mode flips', () => {
  it('Times → Status → Times keeps the picked times', async () => {
    const root = await renderStage({ day: null }); // opens in Status mode
    await pressSegment(root, 'Times');
    await setTime(root, 'Check-in time', '08:15');
    await setTime(root, 'Check-out time (optional)', '17:40');
    await pressSegment(root, 'Status');
    expect(texts(root)).toContain('Set day status');
    await pressSegment(root, 'Times');
    expect(timeField(root, 'Check-in time').props.value).toBe('08:15');
    expect(timeField(root, 'Check-out time (optional)').props.value).toBe('17:40');
  });
});

describe('the ordering gate (the picker enables it — D-TP2)', () => {
  it('check-out before check-in blocks client-side, copy always visible (no blur concept)', async () => {
    const root = await renderStage();
    await typeInto(root, 'Forgot checkout');
    await setTime(root, 'Check-out time (optional)', '09:00');
    expect(texts(root)).toContain('Check-out must be after check-in');
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it('check-out EQUAL to check-in also blocks (the string compare is chronological)', async () => {
    const root = await renderStage();
    await typeInto(root, 'note');
    await setTime(root, 'Check-out time (optional)', '09:35');
    expect(texts(root)).toContain('Check-out must be after check-in');
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it('a later check-out re-enables Save and clears the copy', async () => {
    const root = await renderStage();
    await typeInto(root, 'note');
    await setTime(root, 'Check-out time (optional)', '09:00');
    expect(saveButton(root).props.disabled).toBe(true);
    await setTime(root, 'Check-out time (optional)', '18:10');
    expect(texts(root)).not.toContain('Check-out must be after check-in');
    expect(saveButton(root).props.disabled).toBe(false);
  });
});

describe('the Save gate', () => {
  it('stays disabled until the note trims non-empty (valid prefilled times alone are not enough)', async () => {
    const root = await renderStage();
    expect(saveButton(root).props.disabled).toBe(true);
    await typeInto(root, '   ');
    expect(saveButton(root).props.disabled).toBe(true);
    await typeInto(root, 'Forgot checkout');
    expect(saveButton(root).props.disabled).toBe(false);
  });

  it('the safety net: a malformed time (unreachable via the picker) still blocks, with no format copy', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await setTime(root, 'Check-in time', '9:5');
    await typeInto(root, 'note');
    expect(saveButton(root).props.disabled).toBe(true);
    expect(texts(root)).not.toContain('Use 24-hour time, e.g. 09:00');
  });

  it('an empty check-in blocks the Save gate with neutral guidance, no shaming copy', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await setTime(root, 'Check-in time', '');
    await typeInto(root, 'note');
    expect(saveButton(root).props.disabled).toBe(true);
    // The neutral helper line, not an error (the D3 posture).
    expect(texts(root)).toContain('Pick a check-in time');
  });

  it('CLEAR: a filled optional check-out can be emptied — the body then omits checkoutAt (the 18-2 clear-on-the-wire flow)', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ onSave }); // 09:35 / 18:05 pre-filled
    await setTime(root, 'Check-out time (optional)', '');
    await typeInto(root, 'wrong checkout removed');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T09:35:00+05:30',
      note: 'wrong checkout removed',
    });
  });

  it('in Status mode the note alone gates (the segmented always has a selection)', async () => {
    const root = await renderStage({ day: null });
    await typeInto(root, 'day status note');
    expect(saveButton(root).props.disabled).toBe(false);
  });
});

describe('the XOR bodies', () => {
  it('Status mode saves {status, note} from the ACTIVE segment only', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ day: null, onSave });
    await pressSegment(root, 'Absent');
    await typeInto(root, 'restoring the record');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      status: 'absent',
      note: 'restoring the record',
    });
  });

  it('Times mode saves instants built from the PICKED times, anchored to the work date with the CARRIED offset', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ onSave }); // +05:30 carried from the row
    await setTime(root, 'Check-in time', '09:35');
    await setTime(root, 'Check-out time (optional)', '18:05');
    await typeInto(root, 'late open');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T09:35:00+05:30',
      checkoutAt: '2026-09-15T18:05:00+05:30',
      note: 'late open',
    });
  });

  it('an EMPTY check-out (no pre-fill) omits the checkoutAt key entirely (the wire\'s checkout-alone 422 stays unreachable)', async () => {
    const onSave = jest.fn();
    const root = await renderStage({
      day: row({ checkoutAt: null }),
      onSave,
    });
    await typeInto(root, 'no checkout known');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T09:35:00+05:30',
      note: 'no checkout known',
    });
  });

  it('a non-IST tenant offset carries verbatim into the built instant', async () => {
    const onSave = jest.fn();
    const root = await renderStage({
      day: row({
        checkinAt: '2026-09-15T09:00:00-03:00',
        checkoutAt: null,
      }),
      onSave,
    });
    await typeInto(root, 'offset carried');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T09:00:00-03:00',
      note: 'offset carried',
    });
  });

  it('a Z-terminated carried instant builds a "+00:00" instant (triage: never a slice(-6) mangling)', async () => {
    const onSave = jest.fn();
    const root = await renderStage({
      day: row({ checkinAt: '2026-09-15T04:00:00Z', checkoutAt: null }),
      onSave,
    });
    await typeInto(root, 'z carried');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T04:00:00+00:00',
      note: 'z carried',
    });
  });
});

describe('the note counter', () => {
  it('renders "{n} / 500" right-aligned; amber from 450 (the RevokeSheet anatomy)', async () => {
    const root = await renderStage({ day: null });
    const counterText = () =>
      root.find(n => n.type === Text && /^\d+ \/ 500$/.test(flatText(n)));

    await typeInto(root, 'x'.repeat(449));
    expect(counterText().props.children).toEqual([449, ' / ', 500]);
    expect(colorOf(counterText())).toBe(colors.textMuted);

    await typeInto(root, 'x'.repeat(450));
    expect(colorOf(counterText())).toBe(colors.status.scheduled.fg);
  });
});

describe('the posture slots', () => {
  it('the host-mapped errorMessage renders in the InlineError slot between note and Save', async () => {
    const root = await renderStage({ errorMessage: 'Check-out must be after check-in.' });
    const errors = root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe('Check-out must be after check-in.');
  });

  it('no errorMessage renders no InlineError', async () => {
    const root = await renderStage();
    expect(root.findAllByType(InlineError)).toHaveLength(0);
  });

  it('Back returns to the host (the detail stage)', async () => {
    const onBack = jest.fn();
    const root = await renderStage({ onBack });
    const back = root.findAllByType(Button).find(b => b.props.children === 'Back');
    expect(back!.props.disabled).toBe(false);
    await act(async () => {
      back!.props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('submitting disables Save + Back and spins Save (the sheet owns the write)', async () => {
    const onBack = jest.fn();
    const root = await renderStage({ onBack, submitting: true });
    expect(saveButton(root).props.disabled).toBe(true);
    expect(saveButton(root).props.loading).toBe(true);
    const back = root.findAllByType(Button).find(b => b.props.children === 'Back');
    expect(back!.props.disabled).toBe(true);
  });

  it("the day's StatusBadge leads the flagbadge row; the late flag tags beside it (the mock's Frame B)", async () => {
    const root = await renderStage({ day: row({ isLate: true, lateMinutes: 22 }) });
    expect(texts(root)).toContain('Present');
    expect(texts(root)).toContain('Late · 22m');
  });

  it('a flag-less day STILL shows the status badge — the stage never opens bare (triage: Frame B fidelity)', async () => {
    // Times mode (instants present), so "Present" can only come from the badge.
    const root = await renderStage();
    expect(texts(root)).toContain('Present');
  });
});
