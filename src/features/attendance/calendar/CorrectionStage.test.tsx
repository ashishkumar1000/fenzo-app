/**
 * Stage tests for CorrectionStage (Story 18-4, spec §3 test plan): the
 * initial mode derivation (instants → Times; a status grade / no row →
 * Status); pre-fill from the carried instants' wall times; the status
 * pre-select (current grade when correctable, else Present); values LIFTED
 * above the mode switch (Times → Status → Times keeps typed text); the
 * Save gate (note ≥ 1 after trim AND valid times; checkout-filled-without-
 * checkin blocks with its field's copy); the XOR bodies (status arm;
 * instants arm anchored to the work date with the CARRIED offset, no
 * checkout key when cleared); the note counter (amber from 450, the
 * RevokeSheet anatomy); the InlineError slot; Back; the submitting
 * posture. No I/O — the component renders the posture, the sheet owns the
 * write, so nothing here needs a mock beyond the render itself. Every
 * state-changing call is act-wrapped (the RevokeSheet idiom).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, InlineError, Input } from '../../../components/ui';
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

function field(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const input = root.findAllByType(Input).find(i => i.props.label === label);
  if (input == null) throw new Error(`no input labelled "${label}"`);
  return input;
}

async function typeInto(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  text: string,
) {
  await act(async () => {
    field(root, label).props.onChangeText(text);
  });
}

async function blurField(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  await act(async () => {
    field(root, label).props.onBlur();
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
    expect(field(root, 'Check-in time').props.value).toBe('09:35');
    expect(field(root, 'Check-out time (optional)').props.value).toBe('18:05');
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
    expect(field(root, 'Check-in time').props.value).toBe('09:35');
    expect(field(root, 'Check-out time (optional)').props.value).toBe('');
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
  it('Times → Status → Times keeps the typed times', async () => {
    const root = await renderStage({ day: null }); // opens in Status mode
    await pressSegment(root, 'Times');
    await typeInto(root, 'Check-in time', '08:15');
    await typeInto(root, 'Check-out time (optional)', '17:40');
    await pressSegment(root, 'Status');
    expect(texts(root)).toContain('Set day status');
    await pressSegment(root, 'Times');
    expect(field(root, 'Check-in time').props.value).toBe('08:15');
    expect(field(root, 'Check-out time (optional)').props.value).toBe('17:40');
  });
});

describe('the Save gate', () => {
  it('stays disabled until the note trims non-empty (valid prefilled times alone are not enough)', async () => {
    const root = await renderStage();
    expect(saveButton(root).props.disabled).toBe(true);
    await typeInto(root, 'Note (required)', '   ');
    expect(saveButton(root).props.disabled).toBe(true);
    await typeInto(root, 'Note (required)', 'Forgot checkout');
    expect(saveButton(root).props.disabled).toBe(false);
  });

  it('an invalid check-in blocks; the office copy shows onBlur', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await typeInto(root, 'Check-in time', '9:5');
    await typeInto(root, 'Note (required)', 'note');
    expect(saveButton(root).props.disabled).toBe(true);

    await blurField(root, 'Check-in time');
    expect(texts(root)).toContain('Use 24-hour time, e.g. 09:00');
  });

  it('a blocked Times submit reveals the field errors in place — Save press does not blur (triage: D2 submit-time validation)', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await typeInto(root, 'Check-in time', '9:5');
    await typeInto(root, 'Note (required)', 'note');
    expect(texts(root)).not.toContain('Use 24-hour time, e.g. 09:00');

    await pressSave(root);
    expect(texts(root)).toContain('Use 24-hour time, e.g. 09:00');
  });

  it('a checkout filled while the check-in is invalid blocks with the checkout field\'s copy', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await typeInto(root, 'Check-in time', 'garbage');
    await typeInto(root, 'Check-out time (optional)', '18:00');
    await blurField(root, 'Check-out time (optional)');
    await typeInto(root, 'Note (required)', 'note');

    expect(saveButton(root).props.disabled).toBe(true);
    expect(texts(root)).toContain('Enter a check-in time first');
    // The field keeps its text — never disabled mid-edit.
    expect(field(root, 'Check-out time (optional)').props.value).toBe('18:00');
  });

  it('an invalid checkout shows its own copy and blocks', async () => {
    const root = await renderStage({ day: null });
    await pressSegment(root, 'Times');
    await typeInto(root, 'Check-in time', '09:00');
    await typeInto(root, 'Check-out time (optional)', '24:00');
    await blurField(root, 'Check-out time (optional)');
    await typeInto(root, 'Note (required)', 'note');
    expect(saveButton(root).props.disabled).toBe(true);
    expect(texts(root)).toContain('Use 24-hour time, e.g. 18:00');
  });

  it('in Status mode the note alone gates (the segmented always has a selection)', async () => {
    const root = await renderStage({ day: null });
    await typeInto(root, 'Note (required)', 'day status note');
    expect(saveButton(root).props.disabled).toBe(false);
  });
});

describe('the XOR bodies', () => {
  it('Status mode saves {status, note} from the ACTIVE segment only', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ day: null, onSave });
    await pressSegment(root, 'Absent');
    await typeInto(root, 'Note (required)', 'restoring the record');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      status: 'absent',
      note: 'restoring the record',
    });
  });

  it('Times mode saves instants anchored to the work date with the CARRIED offset', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ onSave }); // +05:30 carried from the row
    await typeInto(root, 'Note (required)', 'late open');
    await pressSave(root);
    expect(onSave).toHaveBeenCalledWith({
      checkinAt: '2026-09-15T09:35:00+05:30',
      checkoutAt: '2026-09-15T18:05:00+05:30',
      note: 'late open',
    });
  });

  it('a cleared checkout omits the checkoutAt key entirely (the wire\'s checkout-alone 422 stays unreachable)', async () => {
    const onSave = jest.fn();
    const root = await renderStage({ onSave });
    await typeInto(root, 'Check-out time (optional)', '');
    await typeInto(root, 'Note (required)', 'no checkout known');
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
    await typeInto(root, 'Note (required)', 'offset carried');
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
    await typeInto(root, 'Note (required)', 'z carried');
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

    await typeInto(root, 'Note (required)', 'x'.repeat(449));
    expect(counterText().props.children).toEqual([449, ' / ', 500]);
    expect(colorOf(counterText())).toBe(colors.textMuted);

    await typeInto(root, 'Note (required)', 'x'.repeat(450));
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
