/**
 * Tests for HolidayFormSheet (Story 15-6, FR-20):
 *  - The impact preview (300ms debounced GET) renders an amber
 *    `InlineNotice tone="info"` above Save, names at most 3 affected
 *    employees, and suffixes "…, plus N more employee(s)" beyond that.
 *  - An empty impact list hides the banner entirely, and a banner with a
 *    valid name does NOT block Save (informational, not blocking).
 *  - Save is gated on both fields valid; a valid add-mode save POSTs
 *    `{ date, name }` and reports success through `onSaved('save')`.
 *  - A 409 ATTENDANCE_HOLIDAY_TAKEN arrives only AFTER the sheet is open
 *    (the host clears the hook's saveError on every open — 15-6 review
 *    iteration 1), is keyed to the date the save was ATTEMPTED for, and
 *    unblocks the moment the form leaves that date — and re-blocks when it
 *    cycles back.
 *  - Save/Delete latch against double-taps; a saveError renders in the
 *    footer even when Save is disabled.
 *  - Edit mode never calls `impact` (the date is immutable on PATCH).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import RNCDateTimePicker from 'react-native-ui-datepicker';
import HolidayFormSheet from './HolidayFormSheet';
import type { ApiError, Holiday } from '../../../services';

const TODAY = '2026-09-27';

type SheetProps = React.ComponentProps<typeof HolidayFormSheet>;

const HOLIDAY: Holiday = { id: 'h1', date: '2026-10-20', name: 'Diwali' };

function employees(...names: string[]) {
  return names.map((name, i) => ({ employeeId: `e${i + 1}`, employeeName: name }));
}

function renderSheet(over: Partial<SheetProps> = {}) {
  const props: SheetProps = {
    visible: true,
    onClose: jest.fn(),
    today: TODAY,
    create: jest.fn().mockResolvedValue(HOLIDAY),
    update: jest.fn().mockResolvedValue(HOLIDAY),
    remove: jest.fn().mockResolvedValue(undefined),
    impact: jest.fn().mockResolvedValue({ date: TODAY, affectedEmployees: [] }),
    isSaving: false,
    saveError: null,
    ...over,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<HolidayFormSheet {...props} />);
  });
  return {
    props,
    renderer,
    /** Re-renders with patched props — how a failed save's `saveError`
     *  arrives in reality (the hook sets it mid-open). */
    updateWith(patch: Partial<SheetProps>) {
      act(() => {
        renderer.update(<HolidayFormSheet {...props} {...patch} />);
      });
    },
    get root() { return renderer.root; },
  };
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Advances past the impact debounce and settles the response. */
async function runImpact(ms = 300) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flush();
  });
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

function hasText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return textNodes(root, value).length > 0;
}

/** Any Text whose copy contains `part` — the banner copy is one long line. */
function textMatching(root: ReactTestRenderer.ReactTestInstance, part: string) {
  return root.findAll(
    (n) => n.type === Text && typeof n.props.children === 'string'
      && n.props.children.includes(part),
  );
}

function findButton(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  for (const text of textNodes(root, label)) {
    let cur: ReactTestRenderer.ReactTestInstance | null = text.parent;
    while (cur) {
      if (typeof cur.props.onPress === 'function') return cur;
      cur = cur.parent;
    }
  }
  throw new Error(`No Button Pressable labelled "${label}"`);
}

function findNameInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    (n) =>
      n.props.placeholder === 'e.g. Diwali' &&
      typeof n.props.onChangeText === 'function',
  );
}

function findDateField(root: ReactTestRenderer.ReactTestInstance) {
  const fields = root.findAll(
    (n) =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith('Date:') &&
      typeof n.props.onPress === 'function',
  );
  expect(fields.length).toBeGreaterThan(0);
  return fields[0];
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('HolidayFormSheet impact preview', () => {
  it('names up to 3 employees and suffixes "…, plus N more employees"', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: TODAY,
      affectedEmployees: employees('Ann', 'Ben', 'Cara', 'Dev', 'Eve'),
    });
    const sheet = renderSheet({ impact });

    // Nothing fires before the debounce window elapses.
    expect(impact).not.toHaveBeenCalled();
    await runImpact();

    expect(impact).toHaveBeenCalledWith(TODAY);
    const banner = textMatching(sheet.root, 'This date overlaps');
    expect(banner.length).toBeGreaterThan(0);
    const copy = banner[0].props.children as string;
    // Three names maximum — Dev and Eve are counted, not listed. The named
    // group joins with "and" before the last name (the 15-6 review's
    // group-possessive rule), so the cap renders "Ann, Ben and Cara", and
    // the remainder is its own noun phrase (15-6 review iteration 1: the
    // old "+2 more employees'" dangled a possessive with no noun).
    expect(copy).toContain('Ann, Ben and Cara, plus 2 more employees.');
    expect(copy).not.toContain('Dev');
    expect(copy).not.toContain('Eve');
    expect(copy).not.toContain("more employees'");
    expect(copy).toContain('It will no longer count as leave for them.');
    // The banner is informational — Save is not blocked by it.
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true); // name empty
  });

  it('lists every employee when 3 or fewer are affected (no suffix)', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: TODAY,
      affectedEmployees: employees('Ann', 'Ben', 'Cara'),
    });
    const sheet = renderSheet({ impact });
    await runImpact();

    const copy = textMatching(sheet.root, 'This date overlaps')[0]
      .props.children as string;
    // The possessive hangs off the whole group, so the names are joined with
    // "and" before the last one — a bare comma list reads "Cara' approved".
    expect(copy).toContain("Ann, Ben and Cara's approved leave");
    expect(copy).not.toContain('more employees');
  });

  it('a single affected employee reads naturally ("Ann\'s approved leave")', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: TODAY,
      affectedEmployees: employees('Ann'),
    });
    const sheet = renderSheet({ impact });
    await runImpact();

    const copy = textMatching(sheet.root, 'This date overlaps')[0]
      .props.children as string;
    expect(copy).toContain("Ann's approved leave");
    // No dangling conjunction for a lone name.
    expect(copy).not.toContain(' and ');
  });

  it('two affected employees read as a pair ("Ann and Ben\'s approved leave")', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: TODAY,
      affectedEmployees: employees('Ann', 'Ben'),
    });
    const sheet = renderSheet({ impact });
    await runImpact();

    const copy = textMatching(sheet.root, 'This date overlaps')[0]
      .props.children as string;
    expect(copy).toContain("Ann and Ben's approved leave");
    expect(copy).not.toContain('more employees');
  });

  it('hides the banner entirely when nobody is affected', async () => {
    const impact = jest
      .fn()
      .mockResolvedValue({ date: TODAY, affectedEmployees: [] });
    const sheet = renderSheet({ impact });
    await runImpact();

    expect(impact).toHaveBeenCalledTimes(1);
    expect(textMatching(sheet.root, 'This date overlaps')).toHaveLength(0);
    expect(textMatching(sheet.root, 'Checking impact')).toHaveLength(0);
  });

  it('never calls impact in edit mode (the date is immutable)', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: HOLIDAY.date,
      affectedEmployees: employees('Ann'),
    });
    const sheet = renderSheet({ holiday: HOLIDAY, impact });
    await runImpact();

    expect(impact).not.toHaveBeenCalled();
    expect(textMatching(sheet.root, 'This date overlaps')).toHaveLength(0);
  });

  it('a failed impact call shows no banner and does not block Save', async () => {
    const impact = jest.fn().mockRejectedValue({ status: 500 });
    const sheet = renderSheet({ impact });
    await runImpact();

    expect(textMatching(sheet.root, 'This date overlaps')).toHaveLength(0);

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);
  });

  it('a banner naming affected employees does NOT block Save once the name is valid', async () => {
    // Test gap: the "informational, not blocking" rule was only ever pinned
    // with an empty name (Save disabled for the wrong reason) — this pins
    // that the banner itself leaves Save enabled.
    const impact = jest.fn().mockResolvedValue({
      date: TODAY,
      affectedEmployees: employees('Ann', 'Ben'),
    });
    const sheet = renderSheet({ impact });
    await runImpact();
    expect(textMatching(sheet.root, 'This date overlaps').length).toBeGreaterThan(0);

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);
  });
});

describe('HolidayFormSheet date floor (FR-20 back-dating)', () => {
  it('add mode hands the calendar no `minDate`, so past dates stay selectable', () => {
    const sheet = renderSheet();
    act(() => {
      findDateField(sheet.root).props.onPress();
    });

    // The library disables out-of-range cells from `minDate`, so its absence
    // is what keeps a past day tappable. This form shipped with
    // `minDate={today}`, which made back-dating impossible — contradicting
    // FR-20 ("add/edit/remove incl. past") and the BE, which allows past
    // dates and recomputes the affected day statuses on read.
    const picker = sheet.root.findByType(RNCDateTimePicker);
    expect(picker.props.minDate).toBeUndefined();
  });

  it('a past date is accepted end-to-end: the field takes it and the POST carries it', async () => {
    const create = jest.fn().mockResolvedValue(HOLIDAY);
    const sheet = renderSheet({ create });
    const labelBefore = findDateField(sheet.root).props
      .accessibilityLabel as string;

    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 8, 20, 12, 0, 0), // 20 Sep 2026, a week before TODAY
      });
    });

    // The field now shows a chosen date rather than the "not selected"
    // placeholder — the past pick was not silently discarded.
    expect(findDateField(sheet.root).props.accessibilityLabel).not.toBe(
      labelBefore,
    );

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Onam');
    });
    await act(async () => {
      await findButton(sheet.root, 'Save').props.onPress();
    });

    // The date reaches the wire unchanged — no client-side past-date clamp.
    expect(create).toHaveBeenCalledWith({ date: '2026-09-20', name: 'Onam' });
  });

  it('edit mode still shows the date read-only (PATCH is name-only)', () => {
    const sheet = renderSheet({ holiday: HOLIDAY });
    // No calendar-bearing field: the immutable date renders as a plain
    // disabled input.
    expect(
      sheet.root.findAllByType(RNCDateTimePicker),
    ).toHaveLength(0);
    expect(hasText(sheet.root, 'Date is immutable after creation.')).toBe(true);
  });
});

describe('HolidayFormSheet save gating', () => {
  it('Save is disabled until both fields are valid', () => {
    const sheet = renderSheet();
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('   ');
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);
  });

  it('add mode POSTs { date, name } (trimmed) and reports the save', async () => {
    const createHoliday = jest.fn().mockResolvedValue(HOLIDAY);
    const onClose = jest.fn();
    const onSaved = jest.fn();
    const sheet = renderSheet({ create: createHoliday, onClose, onSaved });

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('  Diwali  ');
    });
    await act(async () => {
      findButton(sheet.root, 'Save').props.onPress();
      await flush();
    });

    expect(createHoliday).toHaveBeenCalledWith({ date: TODAY, name: 'Diwali' });
    expect(onSaved).toHaveBeenCalledWith('save');
    expect(onClose).toHaveBeenCalledTimes(1);
    // Saved after the write, so the parent can order banner-then-close.
    expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0],
    );
  });

  it('edit mode PATCHes the name only and reports the save', async () => {
    const updateHoliday = jest.fn().mockResolvedValue(HOLIDAY);
    const onSaved = jest.fn();
    const sheet = renderSheet({
      holiday: HOLIDAY,
      update: updateHoliday,
      onSaved,
    });

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali (new)');
    });
    await act(async () => {
      findButton(sheet.root, 'Save').props.onPress();
      await flush();
    });

    expect(updateHoliday).toHaveBeenCalledWith('h1', { name: 'Diwali (new)' });
    expect(onSaved).toHaveBeenCalledWith('save');
  });

  it('a failed save keeps the sheet open', async () => {
    const createHoliday = jest.fn().mockRejectedValue({ status: 500 });
    const onClose = jest.fn();
    const onSaved = jest.fn();
    const sheet = renderSheet({ create: createHoliday, onClose, onSaved });

    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });
    await act(async () => {
      findButton(sheet.root, 'Save').props.onPress();
      await flush();
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('HolidayFormSheet 409 on a taken date (post-open arrival)', () => {
  const takenError: ApiError = {
    status: 409,
    code: 'ATTENDANCE_HOLIDAY_TAKEN',
    message: 'A holiday already exists on this date',
  };

  function openWithTypedName() {
    const sheet = renderSheet();
    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });
    return sheet;
  }

  it('a fresh open is CLEAN: a saveError present at mount is a stale leftover', () => {
    // 15-6 review iteration 1 (P3): the OLD test mounted the sheet with a
    // 409 already in props and pinned "stale 409 blocks Save" — that was
    // wrong about the requirement. The sheet is conditionally mounted by
    // its host, and the host now clears the hook's saveError on EVERY open,
    // so an error at mount is unreachable in the app; a real 409 can only
    // arrive while the sheet is open, after a failed save. Mounting clean
    // and re-rendering with the error is how the failed save actually
    // lands.
    const sheet = openWithTypedName();
    sheet.updateWith({ saveError: takenError });

    expect(hasText(sheet.root, 'A holiday already exists on this date.')).toBe(true);
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);
    // The date field itself carries the error (flips the field red).
    expect(findDateField(sheet.root)).toBeTruthy();
  });

  it('also recognises the BE message form ("already exists")', () => {
    const sheet = openWithTypedName();
    sheet.updateWith({
      saveError: {
        status: 409,
        code: 'CONFLICT',
        message: 'A holiday already exists on this date',
      },
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);
  });

  it('an unrelated save error does not block Save', () => {
    const serverError: ApiError = {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Server exploded',
    };
    const sheet = openWithTypedName();
    sheet.updateWith({ saveError: serverError });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);
  });

  it('the 409 clears the moment the form leaves the taken date (no re-save needed)', () => {
    // 15-6 review iteration 1 test gap (the 409 lifecycle): the conflict is
    // keyed to the date it was raised for, so picking a different date
    // unblocks Save immediately.
    const sheet = openWithTypedName();
    sheet.updateWith({ saveError: takenError });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);

    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 11, 25, 12, 0, 0), // 25 Dec 2026 — a different day
      });
    });

    expect(
      hasText(sheet.root, 'A holiday already exists on this date.'),
    ).toBe(false);
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);
  });

  it('cycling BACK to the taken date re-blocks Save', () => {
    const sheet = openWithTypedName();
    sheet.updateWith({ saveError: takenError });

    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 11, 25, 12, 0, 0),
      });
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);

    // Back to TODAY — the date the 409 was raised for.
    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 8, 27, 12, 0, 0),
      });
    });
    expect(
      hasText(sheet.root, 'A holiday already exists on this date.'),
    ).toBe(true);
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);
  });

  it('the 409 is keyed to the date the save was ATTEMPTED for, not the live form date', async () => {
    // 15-6 review iteration 1 (P4): the date stays interactive while the
    // POST is in flight. Change the date mid-request, THEN let the 409 for
    // the attempted date arrive — the new date must stay free and the
    // conflict must re-block only on the attempted one.
    let rejectCreate!: (err: ApiError) => void;
    const create = jest.fn(
      () =>
        new Promise<Holiday>((_, reject) => {
          rejectCreate = reject;
        }),
    );
    const sheet = renderSheet({ create });
    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });

    await act(async () => {
      findButton(sheet.root, 'Save').props.onPress(); // attempted for TODAY
    });
    // Mid-flight date change.
    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 11, 25, 12, 0, 0),
      });
    });

    await act(async () => {
      rejectCreate(takenError);
      await flush();
    });
    sheet.updateWith({ saveError: takenError });

    // TODAY is flagged; 25 Dec (the date now shown) is NOT.
    expect(
      hasText(sheet.root, 'A holiday already exists on this date.'),
    ).toBe(false);
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(false);

    // Cycling back to the attempted date re-blocks.
    act(() => {
      findDateField(sheet.root).props.onPress();
    });
    act(() => {
      sheet.root.findByType(RNCDateTimePicker).props.onChange({
        date: new Date(2026, 8, 27, 12, 0, 0),
      });
    });
    expect(findButton(sheet.root, 'Save').props.disabled).toBe(true);
  });

  it('a saveError renders in the footer even while Save is blocked', () => {
    // Test gap: the footer's InlineError was never asserted — the banner is
    // the user's only explanation of WHY Save is disabled.
    const serverError: ApiError = {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Server exploded',
    };
    const sheet = openWithTypedName();
    sheet.updateWith({ saveError: serverError });
    expect(hasText(sheet.root, 'Server exploded')).toBe(true);
  });

  it('a double-tap on Save issues exactly one POST (submit latch)', async () => {
    // Test gap: the latch existed on the sheets but was never asserted here.
    let resolveCreate!: (v: Holiday) => void;
    const create = jest.fn(
      () =>
        new Promise<Holiday>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const sheet = renderSheet({ create });
    act(() => {
      findNameInput(sheet.root)[0].props.onChangeText('Diwali');
    });

    await act(async () => {
      findButton(sheet.root, 'Save').props.onPress();
      findButton(sheet.root, 'Save').props.onPress(); // the race window
    });
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(HOLIDAY);
      await flush();
    });
  });

  it('a double-confirm on Delete issues exactly one DELETE (delete latch)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let resolveRemove!: (v: undefined) => void;
    const remove = jest.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveRemove = resolve;
        }),
    );
    const sheet = renderSheet({ holiday: HOLIDAY, remove });

    act(() => {
      findButton(sheet.root, 'Delete holiday').props.onPress();
    });
    const destructive = alertSpy.mock.calls[0][2]?.find(
      (b) => b.style === 'destructive',
    );
    await act(async () => {
      destructive?.onPress?.();
      destructive?.onPress?.(); // the race window
    });
    expect(remove).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRemove(undefined);
      await flush();
    });
    alertSpy.mockRestore();
  });
});
