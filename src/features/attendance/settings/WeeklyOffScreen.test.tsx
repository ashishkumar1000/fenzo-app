/**
 * Tests for WeeklyOffScreen (Story 15-6, FR-18/FR-19):
 *  - First open with no default row preselects Sunday VISUALLY but leaves
 *    Save disabled — an untouched Save must never PUT `[7]`.
 *  - Save enables on the first real divergence and PUTs the working copy.
 *  - The FR-18 gate: 7 selected days blocks Save with the inline rule.
 *  - The per-employee override list renders the row subtitle; Edit opens the
 *    sheet, and saving it closes the sheet with a transient success banner.
 *  - "Set weekly off" is disabled while the tenant has no employees.
 *  - The effective-date field KEEPS its `>= today` floor (the holiday form
 *    deliberately dropped its own) — the deliberate asymmetry, pinned.
 *
 * Render shape: `create` runs inside a sync `act`, and `root` is read fresh
 * from the renderer after the focus-fetch flush (reading `.root` inside a
 * *nested* act sees a not-yet-flushed tree, which React 19 RTR reports as
 * "unmounted test renderer").
 */
// Every registered focus callback, so a test can simulate RETURNING to
// the screen (the refocus refetch) the way navigating back does in the
// app. Both data hooks register one; refocus re-runs all of them.
const mockFocusEffects: Array<() => void> = [];

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react');
  return {
    // The real hook needs a NavigationContainer; run the focus callback on
    // mount instead, which is what a focused screen does in the app.
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        mockFocusEffects.push(cb);
        cb();
      }, [cb]);
    },
  };
});

jest.mock('../../../services', () => ({
  weeklyOffsService: {
    getDefault: jest.fn(),
    setDefault: jest.fn(),
    listOverrides: jest.fn(),
    setOverride: jest.fn(),
    removeOverride: jest.fn(),
  },
}));

jest.mock('../../profile/useMyProfile', () => ({ useMyProfile: jest.fn() }));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { RefreshControl, Text } from 'react-native';
import WeeklyOffScreen from './WeeklyOffScreen';
import { ConfirmDialog, DatePickerField } from '../../../components/ui';
import {
  WEEKLY_OFF_DAY_LETTERS,
  WEEKLY_OFF_DAY_ORDER,
} from './WeeklyOffDayPicker';
import { formatLongDate } from './weeklyOffModel';
import { weeklyOffsService } from '../../../services';
import type {
  IsoWeekday,
  ProfileTechnician,
  WeeklyOffOverrideResponse,
  WeeklyOffView,
} from '../../../services';
import { useMyProfile } from '../../profile/useMyProfile';

const getDefaultMock = weeklyOffsService.getDefault as unknown as jest.Mock;
const setDefaultMock = weeklyOffsService.setDefault as unknown as jest.Mock;
const listOverridesMock =
  weeklyOffsService.listOverrides as unknown as jest.Mock;
const setOverrideMock = weeklyOffsService.setOverride as unknown as jest.Mock;
const useMyProfileMock = useMyProfile as unknown as jest.Mock;

function technician(
  id: string,
  name: string,
  status = 'active',
): ProfileTechnician {
  return {
    id,
    name,
    countryCode: '+91',
    phoneNumber: '9000000000',
    status,
    skills: [],
    skillIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const PRIYA = technician('e1', 'Priya');
const RAMESH = technician('e2', 'Ramesh');

const TODAY = (() => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
})();

function view(days: IsoWeekday[]): WeeklyOffView {
  return { days, validFrom: '2026-01-01', validTo: null };
}

function overrideFor(
  employee: ProfileTechnician,
  days: IsoWeekday[],
  nextDays?: IsoWeekday[],
  nextFrom?: string,
): WeeklyOffOverrideResponse {
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    current: view(days),
    next:
      nextDays && nextFrom
        ? { days: nextDays, validFrom: nextFrom, validTo: null }
        : null,
  };
}

type Screen = {
  navigation: Record<string, jest.Mock>;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

function renderScreen(canGoBack = true): Screen {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(canGoBack),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <WeeklyOffScreen
        navigation={navigation as never}
        route={{ params: {} } as never}
      />,
    );
  });
  return {
    navigation,
    renderer,
    get root() {
      return renderer.root;
    },
  };
}

async function flush(times = 6) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Renders and settles both focus-effect fetches. */
async function renderLoaded(canGoBack = true): Promise<Screen> {
  const screen = renderScreen(canGoBack);
  await act(async () => {
    await flush();
  });
  return screen;
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

function hasText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return textNodes(root, value).length > 0;
}

/**
 * The pill Pressable for one day, located positionally (see the picker
 * suite). `row` picks which pill row: 0 = the tenant-default block, 1 = the
 * override sheet's row (the sheet renders after the scrolled content, so its
 * seven glyphs are the last seven in tree order).
 */
function findPill(
  root: ReactTestRenderer.ReactTestInstance,
  day: IsoWeekday,
  row = 0,
): ReactTestRenderer.ReactTestInstance {
  const glyphs = root.findAll(
    (n) =>
      n.type === Text &&
      typeof n.props.children === 'string' &&
      Object.values(WEEKLY_OFF_DAY_LETTERS).includes(n.props.children),
  );
  const perRow = WEEKLY_OFF_DAY_ORDER.length;
  expect(glyphs.length % perRow).toBe(0);
  expect(glyphs.length / perRow).toBeGreaterThan(row);
  let cur: ReactTestRenderer.ReactTestInstance | null =
    glyphs[row * perRow + WEEKLY_OFF_DAY_ORDER.indexOf(day)].parent;
  while (cur) {
    if (typeof cur.props.onPress === 'function') return cur;
    cur = cur.parent;
  }
  throw new Error(`No pill Pressable for weekday ${day} in row ${row}`);
}

/** Every Pressable behind a Button whose visible label is `label`. */
function findButtons(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance[] {
  const out: ReactTestRenderer.ReactTestInstance[] = [];
  for (const text of textNodes(root, label)) {
    let cur: ReactTestRenderer.ReactTestInstance | null = text.parent;
    while (cur) {
      if (typeof cur.props.onPress === 'function') {
        out.push(cur);
        break;
      }
      cur = cur.parent;
    }
  }
  expect(out.length).toBeGreaterThan(0);
  return out;
}

/** The screen's default-block Save (the sheet, when open, renders later). */
function findDefaultSave(root: ReactTestRenderer.ReactTestInstance) {
  return findButtons(root, 'Save')[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusEffects.length = 0;
  jest.useFakeTimers();
  useMyProfileMock.mockReturnValue({
    profile: { technicians: [PRIYA, RAMESH] },
    isLoading: false,
    error: null,
    lastLoadedAt: null,
  });
  getDefaultMock.mockResolvedValue({ default: null, next: null, history: [] });
  listOverridesMock.mockResolvedValue([]);
  setDefaultMock.mockResolvedValue({ default: null, next: null, history: [] });
  setOverrideMock.mockResolvedValue(overrideFor(PRIYA, [5]));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WeeklyOffScreen tenant default', () => {
  it('the effective date keeps its >= today floor (unlike the holiday date)', async () => {
    const screen = await renderLoaded();

    // The weekly-off effective date IS floored to today: the BE clamps it
    // with greatest() (AD-8) and the FE must not offer a past date the
    // server would silently rewrite. The holiday date is deliberately NOT
    // floored (FR-20 allows back-dating) — this pins the asymmetry, so a
    // future "no floor" sweep cannot quietly strip this one too.
    const field = screen.root.findByType(DatePickerField);
    expect(field.props.today).toBe(TODAY);
    expect(field.props.minDate).toBe(TODAY);
  });

  it('preselects Sunday but keeps Save disabled until the form is dirty', async () => {
    const screen = await renderLoaded();

    expect(findPill(screen.root, 7).props.accessibilityState).toEqual({
      checked: true,
    });
    expect(findDefaultSave(screen.root).props.disabled).toBe(true);
    // The never-configured helper copy, not the configured one.
    expect(
      hasText(
        screen.root,
        "No weekly off set yet. By default Sunday is shown off — pick the days you'd like off. Save to apply for everyone.",
      ),
    ).toBe(true);
  });

  it('tapping a day enables Save and PUTs the working copy', async () => {
    const screen = await renderLoaded();

    act(() => {
      findPill(screen.root, 5).props.onPress();
    });
    const save = findDefaultSave(screen.root);
    expect(save.props.disabled).toBe(false);

    await act(async () => {
      save.props.onPress();
      await flush();
    });

    // Sunday (7) was preselected; Friday (5) was added; sorted ascending.
    expect(setDefaultMock).toHaveBeenCalledWith({
      days: [5, 7],
      effectiveFrom: undefined,
    });
    expect(hasText(screen.root, 'Weekly off saved')).toBe(true);
  });

  it('seeds the working copy from an existing default (no dirty state)', async () => {
    getDefaultMock.mockResolvedValue({
      default: view([6, 7]),
      next: null,
      history: [],
    });
    const screen = await renderLoaded();

    expect(findPill(screen.root, 6).props.accessibilityState).toEqual({
      checked: true,
    });
    expect(findPill(screen.root, 7).props.accessibilityState).toEqual({
      checked: true,
    });
    expect(findPill(screen.root, 5).props.accessibilityState).toEqual({
      checked: false,
    });
    expect(findDefaultSave(screen.root).props.disabled).toBe(true);
    expect(
      hasText(screen.root, 'Pick the days everyone is off. Days not picked count as working days.'),
    ).toBe(true);
  });

  it('blocks Save with the FR-18 rule when all 7 days are off', async () => {
    getDefaultMock.mockResolvedValue({
      default: view([1, 2, 3, 4, 5, 6]),
      next: null,
      history: [],
    });
    const screen = await renderLoaded();

    act(() => {
      findPill(screen.root, 7).props.onPress();
    });

    expect(findDefaultSave(screen.root).props.disabled).toBe(true);
    expect(
      hasText(
        screen.root,
        "Pick at least one working day — a full week off isn't allowed.",
      ),
    ).toBe(true);
    expect(setDefaultMock).not.toHaveBeenCalled();
  });

  it('shows the upcoming-changes panel for a future-effective edit', async () => {
    getDefaultMock.mockResolvedValue({
      default: view([7]),
      next: view([6, 7]),
      history: [view([7]), { days: [6, 7], validFrom: '2099-01-05', validTo: null }],
    });
    const screen = await renderLoaded();

    expect(hasText(screen.root, 'Upcoming changes')).toBe(true);
    expect(hasText(screen.root, 'Sat + Sun')).toBe(true);
  });

  it('the effective date seeds from the SCHEDULED edit only (P3 rule at the screen)', async () => {
    // Test gap: the seed rule (never the active default's past start) was
    // pinned at the sheet but not at this screen's field. The active rule
    // starts '2026-01-01' (in the past); only next.validFrom may seed.
    getDefaultMock.mockResolvedValue({
      default: view([7]),
      next: { days: [6, 7], validFrom: '2099-01-05', validTo: null },
      history: [view([7]), { days: [6, 7], validFrom: '2099-01-05', validTo: null }],
    });
    const screen = await renderLoaded();

    expect(screen.root.findByType(DatePickerField).props.value).toBe(
      '2099-01-05',
    );
    // And a seeded scheduled date does NOT light Save by itself.
    expect(findDefaultSave(screen.root).props.disabled).toBe(true);
  });

  it('the upcoming panel shows only STRICTLY-FUTURE rows (past history excluded)', async () => {
    // Test gap: `history` is the full ascending list — the panel filters it
    // against today. A past row must never appear under "Upcoming changes".
    getDefaultMock.mockResolvedValue({
      default: view([7]),
      next: null,
      history: [
        { days: [7], validFrom: '2020-01-01', validTo: '2026-01-01' },
        { days: [6, 7], validFrom: '2099-01-05', validTo: null },
      ],
    });
    const screen = await renderLoaded();

    expect(hasText(screen.root, 'Upcoming changes')).toBe(true);
    expect(hasText(screen.root, formatLongDate('2020-01-01'))).toBe(false);
    expect(hasText(screen.root, formatLongDate('2099-01-05'))).toBe(true);
    expect(hasText(screen.root, 'Sat + Sun')).toBe(true);
  });

  it('after a save the form RE-SEEDS from the server truth (P4 rule at the screen)', async () => {
    // Test gap: the post-save re-seed was never asserted here. The BE
    // stamped/normalised the range, so without the re-seed the form stayed
    // dirty and an unchanged second tap re-PUT the same change. The GET
    // moves to the saved state for the post-write revalidation (the save's
    // re-seed trusts the canonical GET over the echo).
    getDefaultMock.mockResolvedValueOnce({
      default: view([6, 7]),
      next: null,
      history: [],
    });
    const saved = {
      default: view([5, 6, 7]),
      next: { days: [5, 6, 7], validFrom: '2099-03-01', validTo: null },
      history: [],
    };
    getDefaultMock.mockResolvedValue(saved);
    setDefaultMock.mockResolvedValue(saved);
    const screen = await renderLoaded();

    act(() => {
      findPill(screen.root, 5).props.onPress();
    });
    await act(async () => {
      findDefaultSave(screen.root).props.onPress();
      await flush();
    });
    expect(setDefaultMock).toHaveBeenCalledTimes(1);

    // Re-seeded: the day set matches the server state (Save NOT re-enabled)
    // and the effective field shows the server's scheduled edit, not the
    // blank the form was submitted with.
    expect(findPill(screen.root, 5).props.accessibilityState).toEqual({
      checked: true,
    });
    expect(findDefaultSave(screen.root).props.disabled).toBe(true);
    expect(screen.root.findByType(DatePickerField).props.value).toBe(
      '2099-03-01',
    );

    // Pressing the (disabled) Save again must not fire a second PUT.
    await act(async () => {
      findDefaultSave(screen.root).props.onPress();
      await flush();
    });
    expect(setDefaultMock).toHaveBeenCalledTimes(1);
  });

  it('a double-tap on the default Save issues exactly one PUT (submit latch)', async () => {
    // Test gap (15-6 review iteration 1, the P13 follow-up): the sheets
    // latched; the default block did not — a double-tap inside the
    // pre-re-render window fired two PUTs.
    let resolvePut!: (v: unknown) => void;
    setDefaultMock.mockImplementation(
      () => new Promise((resolve) => { resolvePut = resolve; }),
    );
    const screen = await renderLoaded();

    act(() => {
      findPill(screen.root, 5).props.onPress();
    });
    await act(async () => {
      findDefaultSave(screen.root).props.onPress();
      findDefaultSave(screen.root).props.onPress(); // the race window
    });
    expect(setDefaultMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePut({ default: null, next: null, history: [] });
      await flush();
    });
  });

  it('a failed save renders the saveError banner in the default block', async () => {
    // Test gap: the default block's saveError InlineError was never
    // asserted — the banner is the user's only explanation of why the form
    // did not save.
    setDefaultMock.mockRejectedValue({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Server exploded',
    });
    const screen = await renderLoaded();

    act(() => {
      findPill(screen.root, 5).props.onPress();
    });
    await act(async () => {
      findDefaultSave(screen.root).props.onPress();
      await flush();
    });

    expect(hasText(screen.root, 'Server exploded')).toBe(true);
  });

  it('pull-to-refresh refetches both sections', async () => {
    // 15-6 review iteration 1 (user decision): RefreshControl wired to the
    // existing refresh actions, test-pinned.
    const screen = await renderLoaded();
    expect(getDefaultMock).toHaveBeenCalledTimes(1);
    expect(listOverridesMock).toHaveBeenCalledTimes(1);

    const rc = screen.root.findByType(RefreshControl);
    expect(rc.props.refreshing).toBe(false);

    getDefaultMock.mockResolvedValue({
      default: view([7]),
      next: null,
      history: [],
    });
    await act(async () => {
      await rc.props.onRefresh();
    });

    expect(getDefaultMock).toHaveBeenCalledTimes(2);
    expect(listOverridesMock).toHaveBeenCalledTimes(2);
  });

  it('back goes back when there is a screen beneath', async () => {
    const screen = await renderLoaded(true);
    const back = screen.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Go back' &&
        typeof n.props.onPress === 'function',
    );
    expect(back.length).toBeGreaterThan(0);
    act(() => {
      back[0].props.onPress();
    });
    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(screen.navigation.navigate).not.toHaveBeenCalled();
  });

  it('back falls back to the tabs when the screen is the stack root (deep link)', async () => {
    // A 15-8 wizard deep link can land this screen with nothing beneath —
    // goBack would strand the owner.
    const screen = await renderLoaded(false);
    const back = screen.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Go back' &&
        typeof n.props.onPress === 'function',
    );
    act(() => {
      back[0].props.onPress();
    });
    expect(screen.navigation.goBack).not.toHaveBeenCalled();
    expect(screen.navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });
});

describe('WeeklyOffScreen error and loading states', () => {
  it('a failed DEFAULT first load shows error + Retry', async () => {
    getDefaultMock.mockRejectedValue({ status: 500 });
    const screen = await renderLoaded();

    expect(
      hasText(screen.root, "Couldn't load weekly off. Check your connection and try again."),
    ).toBe(true);
    expect(findButtons(screen.root, 'Retry').length).toBeGreaterThan(0);
  });

  it('the DEFAULT section failure hides the default block, not the overrides section (independent fetches)', async () => {
    getDefaultMock.mockRejectedValue({ status: 500 });
    listOverridesMock.mockResolvedValue([overrideFor(PRIYA, [5])]);
    const screen = await renderLoaded();

    // The overrides list is fully rendered with its own data even though
    // the default block above it failed — one failed GET must not blank
    // the whole screen (15-6 review P10).
    expect(hasText(screen.root, 'Employee-wise weekly off')).toBe(true);
    expect(hasText(screen.root, 'Priya')).toBe(true);
    expect(hasText(screen.root, 'No weekly off set yet.')).toBe(false);
    // No default-block Save anywhere (the helper throws on zero finds, so
    // count the raw label nodes instead).
    expect(textNodes(screen.root, 'Save')).toHaveLength(0);
  });

  it('Retry on a failed default first load re-runs the GET', async () => {
    getDefaultMock.mockRejectedValueOnce({ status: 500 });
    const screen = await renderLoaded();
    expect(getDefaultMock).toHaveBeenCalledTimes(1);

    getDefaultMock.mockResolvedValue({
      default: view([7]),
      next: null,
      history: [],
    });
    await act(async () => {
      findButtons(screen.root, 'Retry')[0].props.onPress();
      await flush();
    });
    expect(getDefaultMock).toHaveBeenCalledTimes(2);
    expect(hasText(screen.root, 'No weekly off set yet.')).toBe(false);
  });

  it('a failed OVERRIDES first load shows error + Retry, not the empty copy', async () => {
    listOverridesMock.mockRejectedValue({ status: 500 });
    const screen = await renderLoaded();

    expect(
      hasText(screen.root, "Couldn't load overrides. Check your connection and try again."),
    ).toBe(true);
    // The empty-state copy would claim "everyone follows the tenant
    // default" about data the screen never received.
    expect(hasText(screen.root, 'No employee-wise weekly offs yet.')).toBe(false);

    listOverridesMock.mockResolvedValue([]);
    await act(async () => {
      findButtons(screen.root, 'Retry')[0].props.onPress();
      await flush();
    });
    expect(
      hasText(
        screen.root,
        'No employee-wise weekly offs yet. Everyone follows the tenant default above.',
      ),
    ).toBe(true);
  });

  it('a refresh failure after a successful load keeps the selection and says so', async () => {
    getDefaultMock.mockResolvedValue({
      default: view([6, 7]),
      next: null,
      history: [],
    });
    const screen = await renderLoaded();
    expect(findPill(screen.root, 6).props.accessibilityState).toEqual({
      checked: true,
    });

    // Refocus (navigate away and back) with the GET now failing: the
    // banner says the shown selection is stale, and it is NOT cleared.
    getDefaultMock.mockRejectedValue({ status: 500 });
    await act(async () => {
      for (const focus of mockFocusEffects) focus();
      await flush();
    });

    expect(
      hasText(screen.root, "Couldn't refresh weekly off. Showing the last loaded selection."),
    ).toBe(true);
    expect(findPill(screen.root, 6).props.accessibilityState).toEqual({
      checked: true,
    });
    // The saveable form is still there (the error did not flip the screen
    // into the first-load error state).
    expect(findButtons(screen.root, 'Save').length).toBeGreaterThan(0);
  });
});

describe('WeeklyOffScreen per-employee overrides', () => {
  it('renders a row per override with its day subtitle', async () => {
    listOverridesMock.mockResolvedValue([overrideFor(PRIYA, [5])]);
    const screen = await renderLoaded();

    expect(hasText(screen.root, 'Employee-wise weekly off')).toBe(true);
    expect(hasText(screen.root, 'Priya')).toBe(true);
    expect(hasText(screen.root, 'Fri only')).toBe(true);
  });

  it("surfaces the override's scheduled future edit on the row", async () => {
    listOverridesMock.mockResolvedValue([
      overrideFor(PRIYA, [5], [4, 5], '2099-01-05'),
    ]);
    const screen = await renderLoaded();

    // The same shape as the default block's Upcoming-changes panel: the
    // pinned long date and the scheduled days, so a rescheduled override
    // is visible (15-6 review P12). The date format itself is pinned by
    // formatLongDate.test.ts — compose it here.
    expect(
      hasText(
        screen.root,
        `From ${formatLongDate('2099-01-05')}: Thu + Fri`,
      ),
    ).toBe(true);
  });

  it('shows the empty copy when nobody has an override', async () => {
    const screen = await renderLoaded();

    expect(
      hasText(
        screen.root,
        'No employee-wise weekly offs yet. Everyone follows the tenant default above.',
      ),
    ).toBe(true);
  });

  it('Edit opens the sheet prefilled, and saving it flashes "Employee weekly off saved"', async () => {
    listOverridesMock.mockResolvedValue([overrideFor(PRIYA, [5])]);
    const screen = await renderLoaded();

    act(() => {
      findButtons(screen.root, 'Edit')[0].props.onPress();
    });
    expect(hasText(screen.root, 'Edit weekly off')).toBe(true);
    // Row 1 is the sheet's own pill row (row 0 is the tenant default block).
    expect(findPill(screen.root, 5, 1).props.accessibilityState).toEqual({
      checked: true,
    });

    // Change Friday (5) → Thursday + Friday (4, 5) and save from the sheet.
    act(() => {
      findPill(screen.root, 4, 1).props.onPress();
    });
    const saves = findButtons(screen.root, 'Save');
    expect(saves.length).toBeGreaterThan(1); // the default block + the sheet
    const sheetSave = saves[saves.length - 1];
    expect(sheetSave.props.disabled).toBe(false);

    await act(async () => {
      sheetSave.props.onPress();
      await flush();
    });

    expect(setOverrideMock).toHaveBeenCalledWith('e1', {
      days: [4, 5],
      effectiveFrom: undefined,
    });
    expect(hasText(screen.root, 'Edit weekly off')).toBe(false);
    expect(hasText(screen.root, 'Employee weekly off saved')).toBe(true);
  });

  it('"Set weekly off" is disabled when the tenant has no employees', async () => {
    useMyProfileMock.mockReturnValue({
      profile: { technicians: [] },
      isLoading: false,
      error: null,
      lastLoadedAt: null,
    });
    const screen = await renderLoaded();

    expect(findButtons(screen.root, 'Set weekly off')[0].props.disabled).toBe(true);
    // The disabled CTA carries its reason — a dead button with no
    // explanation reads as a broken feature (device-check 2026-09-27).
    expect(
      hasText(
        screen.root,
        'No employees yet. Add an employee first, then set their weekly off here.',
      ),
    ).toBe(true);
  });

  it('an all-invited roster disables "Set weekly off" and says why', async () => {
    // Device-check regression: every technician still 'invited' left the
    // CTA dead with no on-screen reason — the owner could not tell a gate
    // from a defect. The copy names the unlock condition instead.
    useMyProfileMock.mockReturnValue({
      profile: {
        technicians: [
          technician('e1', 'Priya', 'invited'),
          technician('e2', 'Ramesh', 'invited'),
        ],
      },
      isLoading: false,
      error: null,
      lastLoadedAt: null,
    });
    const screen = await renderLoaded();

    expect(findButtons(screen.root, 'Set weekly off')[0].props.disabled).toBe(
      true,
    );
    expect(
      hasText(
        screen.root,
        'No active employees yet. Employees become active after they sign in to the app for the first time — then you can set their weekly off here.',
      ),
    ).toBe(true);
    // The invited names are still not offered as override targets.
    expect(hasText(screen.root, 'Priya')).toBe(false);
  });

  it('"Set weekly off" opens the sheet in add mode when employees exist', async () => {
    const screen = await renderLoaded();

    const add = findButtons(screen.root, 'Set weekly off')[0];
    expect(add.props.disabled).toBe(false);
    // Enabled CTA — no disabled-reason copy anywhere.
    expect(
      hasText(
        screen.root,
        'No active employees yet. Employees become active after they sign in to the app for the first time — then you can set their weekly off here.',
      ),
    ).toBe(false);
    expect(
      hasText(
        screen.root,
        'No employees yet. Add an employee first, then set their weekly off here.',
      ),
    ).toBe(false);
    expect(hasText(screen.root, 'Pick an employee')).toBe(false);

    act(() => {
      add.props.onPress();
    });

    expect(hasText(screen.root, 'Pick an employee')).toBe(true);
    // The sheet carries its own (empty) day row, so the picker renders twice.
    expect(findPill(screen.root, 7, 1).props.accessibilityState).toEqual({
      checked: true,
    });
  });

  it('the producer side: "Pick an employee" pushes the shared picker with returnTo + activeOnly', async () => {
    // Test gap: the navigate('SelectTechnicians', …) call itself was never
    // asserted. `returnTo` makes Apply pop back here instead of NewJob;
    // `activeOnly` (15-6 review iteration 1) restricts the picker's roster
    // to active employees so an invited pick cannot be silently dropped.
    const screen = await renderLoaded();

    act(() => {
      findButtons(screen.root, 'Set weekly off')[0].props.onPress();
    });
    act(() => {
      findButtons(screen.root, 'Pick an employee')[0].props.onPress();
    });

    expect(screen.navigation.navigate).toHaveBeenCalledWith(
      'SelectTechnicians',
      { returnTo: 'AttendanceWeeklyOff', activeOnly: true },
    );
  });

  it('invited (not-yet-activated) technicians are NOT eligible for overrides', async () => {
    // Priya is still 'invited' — an override for her would rule an
    // employee who cannot be tracked. Even a picker round-trip that
    // returns her id must not open the sheet pre-picked with her (the
    // eligible list cannot resolve the id).
    useMyProfileMock.mockReturnValue({
      profile: { technicians: [technician('e1', 'Priya', 'invited')] },
      isLoading: false,
      error: null,
      lastLoadedAt: null,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      setParams: jest.fn(),
    };
    act(() => {
      renderer = create(
        <WeeklyOffScreen
          navigation={navigation as never}
          route={{ params: { selectedTechnicianId: 'e1' } } as never}
        />,
      );
    });
    await act(async () => {
      await flush();
    });

    expect(hasText(renderer.root, 'Priya')).toBe(false);
    // The param was still consumed, so it cannot re-trigger later.
    expect(navigation.setParams).toHaveBeenCalledWith({
      selectedTechnicianId: undefined,
    });
  });

  it('the picker round-trip: a selectedTechnicianId param opens the sheet with that employee', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      setParams: jest.fn(),
    };
    act(() => {
      renderer = create(
        <WeeklyOffScreen
          navigation={navigation as never}
          route={{ params: { selectedTechnicianId: 'e2' } } as never}
        />,
      );
    });
    const screen = { renderer, get root() { return renderer.root; }, navigation };
    await act(async () => {
      await flush();
    });

    // The param landed from the shared picker (Apply pops back onto this
    // route with it): the add sheet opens with Ramesh pre-picked, and the
    // param is cleared so later focuses stay quiet.
    expect(hasText(screen.root, 'Ramesh')).toBe(true);
    expect(navigation.setParams).toHaveBeenCalledWith({
      selectedTechnicianId: undefined,
    });

    // And the pre-picked employee makes the sheet saveable once a day
    // diverges from the Sunday preselect.
    act(() => {
      findPill(screen.root, 5, 1).props.onPress();
    });
    const saves = findButtons(screen.root, 'Save');
    expect(saves[saves.length - 1].props.disabled).toBe(false);
  });

  it('removing an override flashes the "Employee weekly off removed" banner', async () => {
    const removeOverrideMock =
      weeklyOffsService.removeOverride as unknown as jest.Mock;
    removeOverrideMock.mockResolvedValue({});
    listOverridesMock.mockResolvedValue([overrideFor(PRIYA, [5])]);
    const screen = await renderLoaded();

    act(() => {
      findButtons(screen.root, 'Edit')[0].props.onPress();
    });
    act(() => {
      findButtons(screen.root, 'Remove weekly off')[0].props.onPress();
    });
    const ask = screen.root
      .findAllByType(ConfirmDialog)
      .filter((d) => d.props.visible === true)
      .at(-1);
    expect(ask).toBeDefined();
    expect(removeOverrideMock).not.toHaveBeenCalled();

    await act(async () => {
      ask?.props.onConfirm();
      await flush();
    });

    // onSaved('delete') — the banner names removal, not "saved".
    expect(hasText(screen.root, 'Employee weekly off removed')).toBe(true);
    expect(hasText(screen.root, 'Employee weekly off saved')).toBe(false);
  });
});
