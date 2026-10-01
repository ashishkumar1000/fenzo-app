/**
 * Tests for HolidaysScreen (Story 15-6, FR-20):
 *  - Upcoming / Past grouping on `date >= today`, in that order.
 *  - Past rows are muted but STILL tappable — the tap opens the edit sheet
 *    (FR-20 allows past edits/removals). The date is read-only in the sheet
 *    (15-5 made it immutable on PATCH), so only the name changes.
 *  - The "+" FAB opens the add sheet; the empty state shows instead of the
 *    list (and no FAB) when the tenant has no holidays.
 *
 * Today is read from the real clock as the IST calendar day (the FE's mirror
 * of the server's per-tenant today), so fixtures are built relative to that
 * same day rather than hard-coded. jest pins TZ=Asia/Kolkata, so the device
 * clock this helper reads IS the IST clock the screen reads.
 *
 * Render shape: `create` runs inside a sync `act`, and the `root` getter is
 * read fresh from the renderer after the focus-fetch flush — reading `.root`
 * inside a *nested* act sees a not-yet-flushed tree (React 19 RTR reports
 * that as "unmounted test renderer").
 */
jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react');
  return {
    // The real hook needs a NavigationContainer; run the focus callback on
    // mount instead, which is what a focused screen does in the app.
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock('../../../services', () => ({
  holidaysService: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    impact: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { RefreshControl, Text } from 'react-native';
import { ConfirmDialog } from '../../../components/ui';
import HolidaysScreen from './HolidaysScreen';
import { holidaysService } from '../../../services';
import { colors } from '../../../theme';

const listMock = holidaysService.list as unknown as jest.Mock;
const createMock = holidaysService.create as unknown as jest.Mock;
const updateMock = holidaysService.update as unknown as jest.Mock;
const removeMock = holidaysService.remove as unknown as jest.Mock;
const impactMock = holidaysService.impact as unknown as jest.Mock;

type Screen = {
  navigation: Record<string, jest.Mock>;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

/** Device-local YYYY-MM-DD, shifted by `days` — the same day the screen reads
 *  (TZ is pinned to Asia/Kolkata in jest.setup.js, so this is the IST day). */
function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const UPCOMING_DATE = isoShift(7);
const PAST_DATE = isoShift(-7);

const DIWALI = { id: 'h1', date: UPCOMING_DATE, name: 'Diwali' };
const HOLI = { id: 'h2', date: PAST_DATE, name: 'Holi' };

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
      <HolidaysScreen
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

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Renders and settles the focus-effect fetch. */
async function renderLoaded(canGoBack = true): Promise<Screen> {
  const screen = renderScreen(canGoBack);
  await act(async () => {
    await flush();
  });
  return screen;
}

/** Flattened style of a node (arrays + falsy entries tolerated). */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (s: unknown) => {
    if (!s) return;
    if (Array.isArray(s)) {
      s.forEach(walk);
      return;
    }
    if (typeof s === 'object') Object.assign(out, s);
  };
  walk(node.props.style);
  return out;
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

function hasText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return textNodes(root, value).length > 0;
}

/** Every string Text in tree order — used for the Upcoming-before-Past check. */
function textOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => n.type === Text && typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
}

/** The ConfirmDialogs currently PRESENTED in the tree — a Modal keeps its
 *  children composed while invisible, so presence reads props.visible. */
function visibleConfirmDialogs(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByType(ConfirmDialog)
    .filter((d) => d.props.visible === true);
}

/** The row Pressable for a holiday (its a11y label starts with the name). */
function findRow(root: ReactTestRenderer.ReactTestInstance, name: string) {
  const rows = root.findAll(
    (n) =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(`Holiday ${name},`) &&
      typeof n.props.onPress === 'function',
  );
  expect(rows.length).toBeGreaterThan(0);
  return rows[0];
}

/** The Pressable behind the Button whose visible label is `label`. */
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

/** The add FAB — the icon-only control labelled "Add holiday". */
function findFab(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    (n) =>
      n.props.accessibilityLabel === 'Add holiday' &&
      typeof n.props.onPress === 'function',
  );
}

/** The name field of the form sheet (by its placeholder). */
function findNameInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    (n) =>
      n.props.placeholder === 'e.g. Diwali' &&
      typeof n.props.onChangeText === 'function',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Fake timers pin the form sheet's 300ms impact debounce and the success
  // banner's 1.5s auto-dismiss, so neither fires mid-test.
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('HolidaysScreen grouping', () => {
  it('splits rows into Upcoming and Past, Upcoming first', async () => {
    listMock.mockResolvedValue([DIWALI, HOLI]);
    const screen = await renderLoaded();
    const root = screen.root;

    expect(hasText(root, 'Upcoming')).toBe(true);
    expect(hasText(root, 'Past')).toBe(true);
    expect(hasText(root, 'Diwali')).toBe(true);
    expect(hasText(root, 'Holi')).toBe(true);

    const order = textOrder(root);
    expect(order.indexOf('Upcoming')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('Upcoming')).toBeLessThan(order.indexOf('Diwali'));
    expect(order.indexOf('Diwali')).toBeLessThan(order.indexOf('Past'));
    expect(order.indexOf('Past')).toBeLessThan(order.indexOf('Holi'));
  });

  it('the section labels are a11y headers, so a screen reader can jump sections', async () => {
    listMock.mockResolvedValue([DIWALI, HOLI]);
    const root = (await renderLoaded()).root;

    // These are the DS `Eyebrow` (the design system's one allowed caps use).
    // Hand-rolled label Texts carried no role — this pins the reason for
    // using the component rather than a local style.
    for (const label of ['Upcoming', 'Past']) {
      const nodes = textNodes(root, label);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].props.accessibilityRole).toBe('header');
    }
  });

  it('a holiday dated today counts as Upcoming, not Past', async () => {
    listMock.mockResolvedValue([{ id: 'h3', date: isoShift(0), name: 'Today' }]);
    const screen = await renderLoaded();
    const root = screen.root;

    expect(hasText(root, 'Upcoming')).toBe(true);
    expect(hasText(root, 'Past')).toBe(false);
    expect(findRow(root, 'Today').props.accessibilityLabel).not.toMatch(/, past$/);
  });

  it('renders only the sections that have rows', async () => {
    listMock.mockResolvedValue([DIWALI]);
    const screen = await renderLoaded();
    const root = screen.root;

    expect(hasText(root, 'Upcoming')).toBe(true);
    expect(hasText(root, 'Past')).toBe(false);
  });

  it('a past row is muted but still tappable — the tap opens the edit sheet', async () => {
    listMock.mockResolvedValue([HOLI]);
    const screen = await renderLoaded();

    // Muted: the name uses the muted text colour and the row announces
    // itself as past for screen readers.
    expect(flat(textNodes(screen.root, 'Holi')[0]).color).toBe(colors.textMuted);
    expect(textNodes(screen.root, `${PAST_DATE} (past)`).length).toBeGreaterThan(0);

    const row = findRow(screen.root, 'Holi');
    expect(row.props.accessibilityLabel).toBe(
      `Holiday Holi, ${PAST_DATE}, past`,
    );

    // Tappable — the edit sheet opens for a past holiday (FR-20).
    expect(hasText(screen.root, 'Edit holiday')).toBe(false);
    await act(async () => {
      row.props.onPress();
      await flush();
    });
    expect(hasText(screen.root, 'Edit holiday')).toBe(true);
    // The date is read-only in edit mode (immutable since 15-5).
    expect(hasText(screen.root, 'Date is immutable after creation.')).toBe(true);
  });

  it('an upcoming row is not muted', async () => {
    listMock.mockResolvedValue([DIWALI]);
    const screen = await renderLoaded();

    expect(flat(textNodes(screen.root, 'Diwali')[0]).color).toBe(
      colors.textStrong,
    );
    expect(textNodes(screen.root, `${UPCOMING_DATE} (past)`)).toHaveLength(0);
    expect(findRow(screen.root, 'Diwali').props.accessibilityLabel).toBe(
      `Holiday Diwali, ${UPCOMING_DATE}`,
    );
  });
});

describe('HolidaysScreen add affordances', () => {
  it('the + FAB opens the add sheet', async () => {
    listMock.mockResolvedValue([DIWALI, HOLI]);
    impactMock.mockResolvedValue({ date: UPCOMING_DATE, affectedEmployees: [] });
    const screen = await renderLoaded();

    const fab = findFab(screen.root);
    expect(fab.length).toBeGreaterThan(0);
    expect(findNameInput(screen.root)).toHaveLength(0);

    await act(async () => {
      fab[0].props.onPress();
      await flush();
    });

    // The add sheet is up (title + both fields) and edit mode is not.
    expect(hasText(screen.root, 'Add holiday')).toBe(true);
    expect(findNameInput(screen.root).length).toBeGreaterThan(0);
    expect(hasText(screen.root, 'Date is immutable after creation.')).toBe(false);
  });

  it('shows the empty state (and no FAB) when there are no holidays', async () => {
    listMock.mockResolvedValue([]);
    const screen = await renderLoaded();

    expect(hasText(screen.root, 'No holidays yet')).toBe(true);
    expect(hasText(screen.root, 'Upcoming')).toBe(false);
    expect(findFab(screen.root)).toHaveLength(0);
  });

  it('an edit-mode rename saves, closes the sheet and flashes the banner', async () => {
    listMock.mockResolvedValue([DIWALI]);
    updateMock.mockResolvedValue({ ...DIWALI, name: 'Diwali (new)' });
    const screen = await renderLoaded();

    await act(async () => {
      findRow(screen.root, 'Diwali').props.onPress();
      await flush();
    });
    expect(hasText(screen.root, 'Edit holiday')).toBe(true);

    // The name is the only editable field (the date is immutable on PATCH).
    const name = findNameInput(screen.root);
    expect(name.length).toBeGreaterThan(0);
    act(() => {
      name[0].props.onChangeText('Diwali (new)');
    });

    const saveButton = findButton(screen.root, 'Save');
    expect(saveButton.props.disabled).toBe(false);

    await act(async () => {
      saveButton.props.onPress();
      await flush();
    });

    expect(updateMock).toHaveBeenCalledWith('h1', { name: 'Diwali (new)' });
    expect(hasText(screen.root, 'Edit holiday')).toBe(false);
    expect(hasText(screen.root, 'Holiday updated')).toBe(true);
  });

  it('closing the sheet without saving flashes nothing (Close is not a save)', async () => {
    listMock.mockResolvedValue([DIWALI]);
    const screen = await renderLoaded();

    await act(async () => {
      findRow(screen.root, 'Diwali').props.onPress();
      await flush();
    });
    expect(hasText(screen.root, 'Edit holiday')).toBe(true);

    const close = screen.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Close' &&
        typeof n.props.onPress === 'function',
    );
    expect(close.length).toBeGreaterThan(0);
    await act(async () => {
      close[0].props.onPress();
      await flush();
    });
    expect(hasText(screen.root, 'Edit holiday')).toBe(false);
    // Regression guard: a dismissal must never claim the holiday was updated.
    expect(hasText(screen.root, 'Holiday updated')).toBe(false);
    expect(hasText(screen.root, 'Holiday removed')).toBe(false);
  });

  it('deleting a holiday confirms first, then flashes the removed banner', async () => {
    listMock.mockResolvedValue([DIWALI]);
    removeMock.mockResolvedValue(undefined);

    const screen = await renderLoaded();
    await act(async () => {
      findRow(screen.root, 'Diwali').props.onPress();
      await flush();
    });

    // The ask presents FIRST — nothing has been removed yet.
    act(() => {
      findButton(screen.root, 'Delete holiday').props.onPress();
    });
    const ask = visibleConfirmDialogs(screen.root)[0];
    expect(ask.props.title).toBe('Delete holiday');
    expect(ask.props.confirmLabel).toBe('Delete');
    expect(ask.props.confirmVariant).toBe('danger');
    expect(ask.props.cancelLabel).toBe('Cancel');
    expect(removeMock).not.toHaveBeenCalled();

    await act(async () => {
      ask.props.onConfirm();
      await flush();
    });

    expect(removeMock).toHaveBeenCalledWith('h1');
    expect(hasText(screen.root, 'Edit holiday')).toBe(false);
    expect(hasText(screen.root, 'Holiday removed')).toBe(true);
  });

  it('a FAILED delete keeps the sheet open with no removed banner (test gap)', async () => {
    listMock.mockResolvedValue([DIWALI]);
    removeMock.mockRejectedValue({ status: 500 });

    const screen = await renderLoaded();
    await act(async () => {
      findRow(screen.root, 'Diwali').props.onPress();
      await flush();
    });

    act(() => {
      findButton(screen.root, 'Delete holiday').props.onPress();
    });
    const ask = visibleConfirmDialogs(screen.root)[0];
    await act(async () => {
      ask.props.onConfirm();
      await flush();
    });

    // The row could not be removed — the sheet must stay up for a retry,
    // and nothing may claim the holiday was removed.
    expect(hasText(screen.root, 'Edit holiday')).toBe(true);
    expect(hasText(screen.root, 'Holiday removed')).toBe(false);
  });
});

describe('HolidaysScreen error, refresh and back affordances', () => {
  it('a refresh failure after a load shows the stale-list banner with Retry, and Retry recovers', async () => {
    // Test gap: the refresh-error banner + its Retry affordance were never
    // driven. The refetch is triggered through pull-to-refresh (the same
    // `refresh` action a refocus uses).
    listMock.mockResolvedValue([DIWALI]);
    const screen = await renderLoaded();

    listMock.mockRejectedValueOnce({ status: 500 });
    await act(async () => {
      await screen.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(
      hasText(
        screen.root,
        "Couldn't refresh holidays. Showing the last loaded list.",
      ),
    ).toBe(true);
    expect(hasText(screen.root, 'Diwali')).toBe(true); // not cleared

    listMock.mockResolvedValue([DIWALI]);
    await act(async () => {
      findButton(screen.root, 'Retry').props.onPress();
      await flush();
    });
    expect(
      hasText(
        screen.root,
        "Couldn't refresh holidays. Showing the last loaded list.",
      ),
    ).toBe(false);
  });

  it('pull-to-refresh refetches the list', async () => {
    // 15-6 review iteration 1 (user decision): RefreshControl wired to the
    // existing refresh, test-pinned.
    listMock.mockResolvedValue([DIWALI]);
    const screen = await renderLoaded();
    expect(listMock).toHaveBeenCalledTimes(1);

    const rc = screen.root.findByType(RefreshControl);
    expect(rc.props.refreshing).toBe(false);
    await act(async () => {
      await rc.props.onRefresh();
    });
    expect(listMock).toHaveBeenCalledTimes(2);
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

describe('HolidaysScreen the empty-state add path and the 409 lifecycle', () => {
  it('the empty-state CTA opens the add sheet and a save flashes "Holiday added"', async () => {
    // Test gap: the CTA-only add path (Spec Change Log 7) and the add-mode
    // banner mapping were never exercised.
    listMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ id: 'h9', date: isoShift(30), name: 'Onam' });
    const screen = await renderLoaded();

    expect(hasText(screen.root, 'No holidays yet')).toBe(true);
    const cta = screen.root.findAll(
      (n) =>
        typeof n.props.onPress === 'function' &&
        n.findAll(
          (m) => m.type === Text && m.props.children === 'Add holiday',
        ).length > 0,
    );
    expect(cta.length).toBeGreaterThan(0);
    await act(async () => {
      cta[0].props.onPress();
      await flush();
    });

    expect(findNameInput(screen.root).length).toBeGreaterThan(0);
    act(() => {
      findNameInput(screen.root)[0].props.onChangeText('Onam');
    });
    await act(async () => {
      findButton(screen.root, 'Save').props.onPress();
      await flush();
    });

    expect(createMock).toHaveBeenCalledWith({
      date: isoShift(0),
      name: 'Onam',
    });
    expect(hasText(screen.root, 'Holiday added')).toBe(true);
    expect(hasText(screen.root, 'Holiday updated')).toBe(false);
  });

  it('cross-open immunity: a 409 from one open never leaks into the next open', async () => {
    // 15-6 review iteration 1 (P3) end-to-end: the sheet is conditionally
    // mounted, so the host must clear the held saveError on every open —
    // otherwise the old banner renders in and its 409 re-blocks Save before
    // any attempt, re-bricking the surface.
    const taken = {
      status: 409,
      code: 'ATTENDANCE_HOLIDAY_TAKEN',
      message: 'A holiday already exists on this date',
      details: null,
    };
    listMock.mockResolvedValue([DIWALI]);
    createMock.mockRejectedValueOnce(taken);
    createMock.mockResolvedValueOnce({ ...DIWALI, name: 'Diwali 2' });
    const screen = await renderLoaded();

    // Open the add sheet and fail a save with the 409.
    await act(async () => {
      findFab(screen.root)[0].props.onPress();
      await flush();
    });
    act(() => {
      findNameInput(screen.root)[0].props.onChangeText('Diwali 2');
    });
    await act(async () => {
      findButton(screen.root, 'Save').props.onPress();
      await flush();
    });
    expect(
      hasText(screen.root, 'A holiday already exists on this date.'),
    ).toBe(true);
    expect(findButton(screen.root, 'Save').props.disabled).toBe(true);

    // Close (the error legitimately stays — the save really failed), then
    // reopen: the fresh open is CLEAN.
    const close = screen.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Close' &&
        typeof n.props.onPress === 'function',
    );
    await act(async () => {
      close[0].props.onPress();
      await flush();
    });
    expect(hasText(screen.root, 'Add holiday')).toBe(false);

    await act(async () => {
      findFab(screen.root)[0].props.onPress();
      await flush();
    });
    expect(
      hasText(screen.root, 'A holiday already exists on this date.'),
    ).toBe(false);
    act(() => {
      findNameInput(screen.root)[0].props.onChangeText('Diwali 2');
    });
    expect(findButton(screen.root, 'Save').props.disabled).toBe(false);

    // And the retry succeeds — no double-submit of the failed POST shape.
    await act(async () => {
      findButton(screen.root, 'Save').props.onPress();
      await flush();
    });
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(hasText(screen.root, 'Holiday added')).toBe(true);
  });
});
