/**
 * Tests for WeeklyOffOverrideSheet (Story 15-6, FR-19):
 *  - Edit mode pre-checks the override's current days (pills are located
 *    positionally — two of the seven glyphs repeat, see the picker's suite).
 *  - Save is a no-op until something actually changes, then PUTs the
 *    sorted working days for that employee and closes.
 *  - The effective date seeds from a scheduled `next` only; a date-only
 *    reschedule of that schedule is dirty and saveable (15-6 review P12).
 *  - An EMPTY day set is a saveable works-all-week override (not blocked);
 *    the all-7-days rule still blocks (FR-18).
 *  - Save/Remove latch against double-taps; Remove disables while saving.
 *  - "Remove weekly off" goes through the destructive `Alert.alert` confirm,
 *    passes the sheet's effective date to the DELETE, and only the
 *    destructive button runs it.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import WeeklyOffOverrideSheet from './WeeklyOffOverrideSheet';
import { DatePickerField } from '../../../components/ui';
import {
  WEEKLY_OFF_DAY_LETTERS,
  WEEKLY_OFF_DAY_ORDER,
} from './WeeklyOffDayPicker';
import type {
  IsoWeekday,
  ProfileTechnician,
  WeeklyOffOverrideResponse,
} from '../../../services';

const TODAY = '2026-09-27';

type SheetProps = React.ComponentProps<typeof WeeklyOffOverrideSheet>;

function technician(id: string, name: string): ProfileTechnician {
  return {
    id,
    name,
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'invited',
    skills: [],
    skillIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const PRIYA = technician('e1', 'Priya');
const RAMESH = technician('e2', 'Ramesh');

function overrideFor(
  employee: ProfileTechnician,
  days: IsoWeekday[],
  nextDays?: IsoWeekday[],
  nextFrom?: string,
): WeeklyOffOverrideResponse {
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    current: { days, validFrom: TODAY, validTo: null },
    next:
      nextDays && nextFrom
        ? { days: nextDays, validFrom: nextFrom, validTo: null }
        : null,
  };
}

function renderSheet(over: Partial<SheetProps> = {}) {
  const props: SheetProps = {
    visible: true,
    onClose: jest.fn(),
    today: TODAY,
    employees: [PRIYA, RAMESH],
    saveOverride: jest.fn().mockResolvedValue({}),
    removeOverride: jest.fn().mockResolvedValue(undefined),
    isSaving: false,
    saveError: null,
    onPickEmployee: jest.fn(),
    ...over,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<WeeklyOffOverrideSheet {...props} />);
  });
  return { root: renderer.root, props };
}

/**
 * The pill Pressable for one day. Located positionally: the row renders
 * `WEEKLY_OFF_DAY_ORDER.map(...)`, so the n-th single-glyph Text in tree
 * order belongs to the n-th day (Tue/Thu and Sat/Sun share a glyph).
 */
function findPill(
  root: ReactTestRenderer.ReactTestInstance,
  day: IsoWeekday,
): ReactTestRenderer.ReactTestInstance {
  const glyphs = root.findAll(
    (n) =>
      n.type === Text &&
      typeof n.props.children === 'string' &&
      Object.values(WEEKLY_OFF_DAY_LETTERS).includes(n.props.children),
  );
  expect(glyphs).toHaveLength(WEEKLY_OFF_DAY_ORDER.length);
  const index = WEEKLY_OFF_DAY_ORDER.indexOf(day);
  let cur: ReactTestRenderer.ReactTestInstance | null = glyphs[index].parent;
  while (cur) {
    if (typeof cur.props.onPress === 'function') return cur;
    cur = cur.parent;
  }
  throw new Error(`No pill Pressable for weekday ${day}`);
}

/** The Pressable behind the Button whose label is `label`. */
function findButton(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const texts = root.findAll((n) => n.type === Text && n.props.children === label);
  for (const text of texts) {
    let cur: ReactTestRenderer.ReactTestInstance | null = text.parent;
    while (cur) {
      if (typeof cur.props.onPress === 'function') return cur;
      cur = cur.parent;
    }
  }
  throw new Error(`No Button Pressable labelled "${label}"`);
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAll((n) => n.type === Text && n.props.children === text).length > 0;
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('WeeklyOffOverrideSheet — edit mode', () => {
  const override = overrideFor(PRIYA, [5]);

  it("pre-checks the override's current days", () => {
    const { root } = renderSheet({ override });
    expect(findPill(root, 5).props.accessibilityLabel).toBe('Friday');
    expect(findPill(root, 5).props.accessibilityState).toEqual({ checked: true });
    for (const day of WEEKLY_OFF_DAY_ORDER) {
      if (day === 5) continue;
      expect(findPill(root, day).props.accessibilityState).toEqual({
        checked: false,
      });
    }
  });

  it('Save is disabled until the day selection actually diverges', () => {
    const { root } = renderSheet({ override });
    expect(findButton(root, 'Save').props.disabled).toBe(true);
  });

  it('toggling a saved day OFF and back ON keeps Save disabled (no net change, no re-PUT)', () => {
    // The edit-mode half of the 15-8 mode-split: the baseline is the SAVED
    // rule, so a touch that restores it is not dirty — Save must not
    // re-PUT the unchanged rule.
    const { root } = renderSheet({ override });
    act(() => {
      findPill(root, 5).props.onPress(); // off
    });
    act(() => {
      findPill(root, 5).props.onPress(); // back on — net no change
    });
    expect(findButton(root, 'Save').props.disabled).toBe(true);
  });

  it('Save PUTs the sorted working days for that employee and closes', async () => {
    const saveOverride = jest.fn().mockResolvedValue({});
    const onClose = jest.fn();
    const { root } = renderSheet({ override, saveOverride, onClose });

    // Add Thursday (4) to Friday (5).
    act(() => {
      findPill(root, 4).props.onPress();
    });
    expect(findButton(root, 'Save').props.disabled).toBe(false);

    await act(async () => {
      findButton(root, 'Save').props.onPress();
      await flush();
    });

    expect(saveOverride).toHaveBeenCalledTimes(1);
    expect(saveOverride).toHaveBeenCalledWith('e1', {
      days: [4, 5],
      effectiveFrom: undefined,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the sheet open (the parent surfaces the error)', async () => {
    const saveOverride = jest.fn().mockRejectedValue({ status: 500 });
    const onClose = jest.fn();
    const { root } = renderSheet({ override, saveOverride, onClose });

    act(() => {
      findPill(root, 4).props.onPress();
    });
    await act(async () => {
      findButton(root, 'Save').props.onPress();
      await flush();
    });

    expect(saveOverride).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an all-7-days selection blocks Save with the FR-18 inline rule', () => {
    const { root } = renderSheet({
      override: overrideFor(PRIYA, [1, 2, 3, 4, 5, 6]),
    });
    act(() => {
      findPill(root, 7).props.onPress();
    });
    expect(findButton(root, 'Save').props.disabled).toBe(true);
    expect(
      hasText(
        root,
        "Pick at least one working day — a full week off isn't allowed.",
      ),
    ).toBe(true);
  });

  it('an EMPTY day set is saveable — the works-all-week override (15-5 contract)', async () => {
    const saveOverride = jest.fn().mockResolvedValue({});
    const { root } = renderSheet({
      override: overrideFor(PRIYA, [7]),
      saveOverride,
    });

    // Deselect the last remaining day → empty. Previously the sheet blocked
    // this with a `noWorkingDays` gate while the BE accepts `days: []` as
    // an explicit works-all-7-days marker override (15-6 review P2).
    act(() => {
      findPill(root, 7).props.onPress();
    });
    expect(findButton(root, 'Save').props.disabled).toBe(false);
    // The aligned copy: leaving it empty is a legitimate works-all-week
    // override, so the helper says so instead of warning (15-6 review P2).
    expect(
      hasText(root, 'Pick at least one day off — or leave it empty if Priya works all 7 days.'),
    ).toBe(true);

    await act(async () => {
      findButton(root, 'Save').props.onPress();
      await flush();
    });
    expect(saveOverride).toHaveBeenCalledWith('e1', {
      days: [],
      effectiveFrom: undefined,
    });
  });

  it('a double-tap on Save issues exactly one PUT (submit latch)', async () => {
    let resolveSave!: (v: unknown) => void;
    const saveOverride = jest.fn(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );
    const { root } = renderSheet({ override, saveOverride });

    act(() => {
      findPill(root, 4).props.onPress();
    });
    await act(async () => {
      findButton(root, 'Save').props.onPress();
      findButton(root, 'Save').props.onPress(); // the race window
    });
    expect(saveOverride).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave({});
      await flush();
    });
  });
});

describe('WeeklyOffOverrideSheet — the scheduled next edit (15-6 review P12)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const NEXT_FROM = '2026-10-05';
  const override = overrideFor(PRIYA, [5], [4, 5], NEXT_FROM);

  it('seeds the effective date from next.validFrom with NO spurious dirty', () => {
    const { root } = renderSheet({ override });
    expect(root.findByType(DatePickerField).props.value).toBe(NEXT_FROM);
    // Untouched form: nothing diverges from what the user was shown.
    expect(findButton(root, 'Save').props.disabled).toBe(true);
  });

  it('never seeds from the current rule start (a past date the BE clamps)', () => {
    // current.validFrom is TODAY's date here, but the same rule holds for a
    // genuinely past one: only next.validFrom seeds.
    const past = {
      ...override,
      current: { days: [5] as IsoWeekday[], validFrom: '2020-01-01', validTo: null },
    };
    const { root } = renderSheet({ override: past });
    expect(root.findByType(DatePickerField).props.value).toBe(NEXT_FROM);
  });

  it('a date-only reschedule is dirty and PUTs the new schedule', async () => {
    const saveOverride = jest.fn().mockResolvedValue({});
    const { root } = renderSheet({ override, saveOverride });

    // Change ONLY the effective date — same days, new schedule.
    act(() => {
      root.findByType(DatePickerField).props.onChange('2026-10-12');
    });
    expect(findButton(root, 'Save').props.disabled).toBe(false);

    await act(async () => {
      findButton(root, 'Save').props.onPress();
      await flush();
    });
    expect(saveOverride).toHaveBeenCalledWith('e1', {
      days: [5],
      effectiveFrom: '2026-10-12',
    });
  });

  it('Remove passes the sheet’s chosen date to the DELETE', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const removeOverride = jest.fn().mockResolvedValue(undefined);
    const { root } = renderSheet({ override, removeOverride });

    act(() => {
      root.findByType(DatePickerField).props.onChange('2026-10-20');
    });
    act(() => {
      findButton(root, 'Remove weekly off').props.onPress();
    });
    // The confirm copy names the date the removal takes effect from.
    expect(String(alertSpy.mock.calls[0][1])).toContain('2026-10-20');

    const destructive = alertSpy.mock.calls[0][2]?.find(
      (b) => b.style === 'destructive',
    );
    await act(async () => {
      destructive?.onPress?.();
      await flush();
    });
    expect(removeOverride).toHaveBeenCalledWith('e1', '2026-10-20');
  });

  it('Remove is disabled while a write is in flight', () => {
    const { root } = renderSheet({ override, isSaving: true });
    expect(findButton(root, 'Remove weekly off').props.disabled).toBe(true);
  });
});

describe('WeeklyOffOverrideSheet — add mode', () => {
  it('Save is disabled until an employee is picked', () => {
    const { root } = renderSheet();
    act(() => {
      findPill(root, 5).props.onPress();
    });
    // Day set is dirty, but there is no employee to PUT against yet.
    expect(findButton(root, 'Save').props.disabled).toBe(true);
    expect(hasText(root, 'Pick an employee')).toBe(true);
  });

  it('disables the picker CTA when the tenant has no employees', () => {
    const { root } = renderSheet({ employees: [] });
    const cta = root.findAll(
      (n) => n.props.accessibilityLabel === 'Pick an employee',
    );
    expect(cta.length).toBeGreaterThan(0);
    expect(cta[0].props.disabled).toBe(true);
    expect(hasText(root, 'No employees yet')).toBe(true);
  });

  it('Save is enabled once an employee is picked and a day changed', () => {
    const { root } = renderSheet({ pickedEmployee: RAMESH });
    act(() => {
      findPill(root, 5).props.onPress();
    });
    expect(findButton(root, 'Save').props.disabled).toBe(false);
  });

  it('toggling the Sunday preselect OFF and back ON leaves Save ENABLED (the fixed dead end)', () => {
    // The add-mode half of the 15-8 mode-split, distinguishing the FIXED
    // gating from the old dirty-vs-baseline rule: restoring the [SUNDAY]
    // baseline leaves the set untouched AND not dirty, yet the owner has
    // deliberately touched it — under the old gating this was exactly the
    // device-reported unsavable Sunday-only override.
    const { root } = renderSheet({ pickedEmployee: RAMESH });
    act(() => {
      findPill(root, 7).props.onPress(); // off
    });
    act(() => {
      findPill(root, 7).props.onPress(); // back on — the baseline again
    });
    expect(findButton(root, 'Save').props.disabled).toBe(false);
  });

  it('PUTs against the picked employee (Sunday preselected, then Saturday added)', async () => {
    const saveOverride = jest.fn().mockResolvedValue({});
    const onClose = jest.fn();
    const { root } = renderSheet({
      pickedEmployee: RAMESH,
      saveOverride,
      onClose,
    });

    // Add mode starts from the same Sunday default as the tenant block.
    expect(findPill(root, 7).props.accessibilityState).toEqual({ checked: true });
    act(() => {
      findPill(root, 6).props.onPress();
    });
    await act(async () => {
      findButton(root, 'Save').props.onPress();
      await flush();
    });

    expect(saveOverride).toHaveBeenCalledWith('e2', {
      days: [6, 7],
      effectiveFrom: undefined,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no Remove action (nothing to remove yet)', () => {
    const { root } = renderSheet({ pickedEmployee: RAMESH });
    expect(hasText(root, 'Remove weekly off')).toBe(false);
  });
});

describe('WeeklyOffOverrideSheet — the Remove weekly off confirm flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks for confirmation before deleting; the cancel path deletes nothing', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const removeOverride = jest.fn();
    const { root } = renderSheet({
      override: overrideFor(PRIYA, [5]),
      removeOverride,
    });

    act(() => {
      findButton(root, 'Remove weekly off').props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Remove weekly off');
    expect(String(body)).toMatch(/Priya/);
    expect(buttons?.map((b) => b.text)).toEqual(['Cancel', 'Remove']);
    expect(buttons?.[0].style).toBe('cancel');
    expect(buttons?.[1].style).toBe('destructive');
    // Nothing is deleted until the destructive button is pressed.
    expect(removeOverride).not.toHaveBeenCalled();

    act(() => {
      buttons?.[0].onPress?.();
    });
    expect(removeOverride).not.toHaveBeenCalled();
  });

  it('the destructive button DELETEs the override and closes the sheet', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const removeOverride = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { root } = renderSheet({
      override: overrideFor(PRIYA, [5]),
      removeOverride,
      onClose,
    });

    act(() => {
      findButton(root, 'Remove weekly off').props.onPress();
    });
    const destructive = alertSpy.mock.calls[0][2]?.find(
      (b) => b.style === 'destructive',
    );

    await act(async () => {
      destructive?.onPress?.();
      await flush();
    });

    // The sheet's (blank) effective date rides along as undefined — the
    // BE's default-today removal contract.
    expect(removeOverride).toHaveBeenCalledWith('e1', undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed DELETE keeps the sheet open', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const removeOverride = jest.fn().mockRejectedValue({ status: 500 });
    const onClose = jest.fn();
    const { root } = renderSheet({
      override: overrideFor(PRIYA, [5]),
      removeOverride,
      onClose,
    });

    act(() => {
      findButton(root, 'Remove weekly off').props.onPress();
    });
    const destructive = alertSpy.mock.calls[0][2]?.find(
      (b) => b.style === 'destructive',
    );
    await act(async () => {
      destructive?.onPress?.();
      await flush();
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
