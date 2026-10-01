/**
 * Tests for RosterScreen (Story 15-9) — the Team enrolment roster:
 *  - the tri-state contract (first-load shimmer / first-load error + Retry
 *    / stale banner over kept rows);
 *  - raw-truth rows (never / upcoming / covering) with the UX-DR9 flows:
 *    toggle-on opens the picker inline with the switch uncommitted; the
 *    "Starts today" chip future-dates the enable; upcoming rows carry a
 *    disabled switch + "Cancel the {date} start"; reassignment goes through
 *    the effective-date sheet;
 *  - the scheduled-move note appears after a future reassign and survives
 *    while the write response still shows the old office.
 *
 * Conventions per HolidaysScreen.test.tsx: the focus hook runs its callback
 * on mount, services are mocked at the barrel, fixtures are built relative
 * to the device clock (TZ pinned to Asia/Kolkata = the IST day), and the
 * root getter is read fresh after each flush.
 */
jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock('../../../services', () => ({
  enrolmentsService: {
    list: jest.fn(),
    enable: jest.fn(),
    reassign: jest.fn(),
    disable: jest.fn(),
  },
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ScrollView, Switch, Text } from 'react-native';
import { Button, ConfirmDialog, Skeleton } from '../../../components/ui';
import { Calendar } from '../../../components/ui/Calendar';
import RosterScreen from './RosterScreen';
import { OfficePickerSheet } from './OfficePickerSheet';
import { ReassignOfficeSheet } from './ReassignOfficeSheet';
import { enrolmentsService, officesService } from '../../../services';
import { formatLongDate } from '../../../utils';
import type { EnrolmentOverview, EnrolmentWriteState } from '../../../services';
import type { Office } from '../../../types/office';

const listMock = enrolmentsService.list as unknown as jest.Mock;
const enableMock = enrolmentsService.enable as unknown as jest.Mock;
const reassignMock = enrolmentsService.reassign as unknown as jest.Mock;
const disableMock = enrolmentsService.disable as unknown as jest.Mock;
const officesListMock = officesService.list as unknown as jest.Mock;

/** Device-local YYYY-MM-DD shifted by `days` (TZ pinned = the IST day). */
function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TODAY = isoShift(0);
const FUTURE = isoShift(34);

function officeRow(overrides: Partial<Office> = {}): Office {
  return {
    id: 'o1',
    name: 'HQ',
    latitude: 12.97,
    longitude: 77.59,
    radiusM: 100,
    archivedAt: null,
    rule: null,
    nextRule: null,
    ...overrides,
  };
}

function row(overrides: Partial<EnrolmentOverview> = {}): EnrolmentOverview {
  return {
    employeeId: 'e1',
    employeeName: 'Priya',
    phone: '+919000000000',
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    enabledAt: null,
    onboardedAt: null,
    officeId: null,
    officeName: null,
    ...overrides,
  };
}

function writeState(
  overrides: Partial<EnrolmentWriteState> = {},
): EnrolmentWriteState {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: TODAY,
    enabledAt: `${TODAY}T10:00:00Z`,
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

const PRIYA = row(); // never enrolled
const RAMESH = row({
  employeeId: 'e2',
  employeeName: 'Ramesh',
  phone: '+919000000001',
  attendanceStartDate: TODAY,
  officeId: 'o1',
  officeName: 'HQ',
}); // covering today at HQ
const ARJUN = row({
  employeeId: 'e3',
  employeeName: 'Arjun',
  phone: '+919000000002',
  attendanceStartDate: FUTURE,
  officeId: 'o2',
  officeName: 'Branch',
}); // upcoming at Branch

const OFFICES = [
  officeRow({ id: 'o1', name: 'HQ' }),
  officeRow({ id: 'o2', name: 'Branch' }),
  officeRow({ id: 'o3', name: 'Old Depot', archivedAt: `${TODAY}T00:00:00Z` }),
];

type Screen = {
  navigation: Record<string, jest.Mock>;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.forEach((r) => r.unmount());
  });
  mountedRenderers.length = 0;
});

function renderScreen(): Screen {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <RosterScreen
        navigation={navigation as never}
        route={{ params: undefined } as never}
      />,
    );
  });
  // The shimmer's animation loops must be stopped at teardown or the
  // Jest worker crashes (react-test-renderer has no auto-cleanup).
  mountedRenderers.push(renderer);
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

/** The ConfirmDialog currently PRESENTED in the tree. A Modal keeps its
 *  children composed while invisible, so presence reads props.visible —
 *  never element existence. */
function confirmDialogUp(root: ReactTestRenderer.ReactTestInstance) {
  return (
    root.findAllByType(ConfirmDialog).find((d) => d.props.visible === true) ??
    null
  );
}

async function renderLoaded(): Promise<Screen> {
  const screen = renderScreen();
  await act(async () => {
    await flush();
  });
  return screen;
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

/** Text nodes whose flattened string content includes `part` (JSX
 *  interpolation makes children an array — flatten before matching). */
function textContaining(root: ReactTestRenderer.ReactTestInstance, part: string) {
  return root.findAll((n) => {
    if (n.type !== Text) return false;
    const children = n.props.children;
    const flat = Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
    return flat.includes(part);
  });
}

/** The first node whose accessible label matches (the hit target). */
function pressableWithLabel(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  return root.find((n) => n.props?.accessibilityLabel === label);
}

beforeEach(() => {
  jest.resetAllMocks();
  listMock.mockResolvedValue([PRIYA, RAMESH, ARJUN]);
  officesListMock.mockResolvedValue(OFFICES);
  enableMock.mockResolvedValue(writeState({}));
  reassignMock.mockResolvedValue(writeState({}));
  disableMock.mockResolvedValue(
    writeState({ attendanceEnabled: false, attendanceAccess: 'history_only' }),
  );
});

describe('tri-state', () => {
  it('the first load shows the labelled shimmer, then the rows', async () => {
    let resolveList!: (rows: EnrolmentOverview[]) => void;
    listMock.mockImplementationOnce(
      () => new Promise<EnrolmentOverview[]>((r) => (resolveList = r)),
    );
    const screen = renderScreen();

    expect(
      screen.root.findAll(
        (node) => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.root.findAllByType(Skeleton as never).length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveList([PRIYA]);
      await flush();
    });

    expect(
      screen.root.findAll(
        (node) => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
    expect(textContaining(screen.root, 'Priya').length).toBeGreaterThan(0);
  });

  it('a first-load failure renders InlineError + Retry; Retry refetches', async () => {
    listMock.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    listMock.mockResolvedValueOnce([PRIYA]);
    const screen = renderScreen();
    await act(async () => {
      await flush();
    });

    expect(textNodes(screen.root, 'Retry').length).toBe(1);

    // Two Buttons exist (the reassign sheet's confirm mounts while its
    // Sheet is dismissed) — match the Retry one by its children.
    const retryButton = screen.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Retry');
    await act(async () => {
      retryButton?.props.onPress();
      await flush();
    });

    expect(textContaining(screen.root, 'Priya').length).toBeGreaterThan(0);
  });

  it('a refresh failure over loaded rows keeps the rows under a stale banner', async () => {
    const screen = await renderLoaded();
    listMock.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });

    // Drive the RefreshControl's onRefresh through its props.
    const rc = screen.root.find((n) => n.props?.onRefresh);
    await act(async () => {
      await rc.props.onRefresh();
      await flush();
    });

    expect(
      textNodes(
        screen.root,
        "Couldn't refresh the roster. Showing the last loaded state.",
      ).length,
    ).toBe(1);
    expect(textContaining(screen.root, 'Priya').length).toBeGreaterThan(0);
  });

  it('an empty roster shows the invite-first empty state', async () => {
    listMock.mockResolvedValue([]);
    const screen = await renderLoaded();
    expect(textNodes(screen.root, 'Invite technicians first').length).toBe(1);
  });
});

describe('raw-truth rows', () => {
  it('renders never / covering / upcoming anatomy from the ungated fields', async () => {
    const screen = await renderLoaded();
    // State pills per row.
    expect(textNodes(screen.root, 'Not tracked').length).toBe(1);
    expect(textNodes(screen.root, 'Active').length).toBe(1);
    expect(textNodes(screen.root, 'Upcoming').length).toBe(1);
    // Covering: icon'd office line.
    expect(textNodes(screen.root, 'Office: HQ').length).toBe(1);
    // Upcoming: header start line + the start action button (both long-form).
    expect(textContaining(screen.root, `Starts ${formatLongDate(FUTURE)}`).length).toBe(2);
    // Never: the phone stands in for the office line — and per the spec
    // matrix, NO reassign affordance (a bare PUT /office would 422).
    expect(textNodes(screen.root, '+919000000000').length).toBe(1);
    expect(
      screen.root.findAll(
        (n) => n.props?.accessibilityLabel === 'Change office for Priya',
      ).length,
    ).toBe(0);
    // Covering + upcoming rows carry the affordance (RTR mirrors the label
    // through nested layers, so assert presence, not a single node).
    expect(
      screen.root.findAll(
        (n) => n.props?.accessibilityLabel === 'Change office for Ramesh',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.root.findAll(
        (n) => n.props?.accessibilityLabel === 'Change office for Arjun',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('the upcoming row carries a DISABLED switch and a cancel-start action; covering rows are togglable', async () => {
    const screen = await renderLoaded();
    // The toggle is a role=switch Pressable carrying the accessible label.
    const arjun = pressableWithLabel(screen.root, 'Track attendance for Arjun');
    expect(arjun.props.accessibilityState.disabled).toBe(true);

    const ramesh = pressableWithLabel(screen.root, 'Track attendance for Ramesh');
    expect(ramesh.props.accessibilityState.disabled).toBe(false);

    expect(
      textContaining(screen.root, `Cancel the ${formatLongDate(FUTURE)} start`).length,
    ).toBe(1);
  });
});

describe('toggle-on (UX-DR9)', () => {
  it('a never row opens the picker INLINE; the pick PUTs with the office and commits the switch', async () => {
    const screen = await renderLoaded();
    enableMock.mockResolvedValue(
      writeState({ attendanceStartDate: TODAY, officeId: 'o1', officeName: 'HQ' }),
    );

    // Toggle Priya's switch ON — no office → the picker sheet opens.
    const priyaToggle = pressableWithLabel(screen.root, 'Track attendance for Priya');
    await act(async () => {
      priyaToggle.props.onPress();
      await flush();
    });
    expect(enableMock).not.toHaveBeenCalled(); // nothing commits until a pick
    expect(textNodes(screen.root, 'Choose an office').length).toBe(1);

    // Pick HQ (the archived Old Depot must not even be rendered).
    await act(async () => {
      pressableWithLabel(screen.root, 'Assign HQ for Priya').props.onPress();
      await flush();
    });

    expect(enableMock).toHaveBeenCalledWith('e1', 'o1', undefined);
    expect(screen.root.findByType(OfficePickerSheet).props.visible).toBe(false);
    expect(
      textContaining(screen.root, 'Office: HQ').length,
    ).toBeGreaterThan(0);
  });

  it('the start button opens the full-screen DatePicker; the returned date future-dates the enable', async () => {
    const screen = await renderLoaded();

    // Tap the start button → the DatePicker route opens with the row's
    // context (never row → no pre-selection).
    const chip = pressableWithLabel(
      screen.root,
      `Starts today for Priya, tap to change`,
    );
    await act(async () => {
      chip.props.onPress();
    });

    expect(screen.navigation.navigate).toHaveBeenCalledWith('DatePicker', {
      title: 'Start date for Priya',
      value: null,
      today: TODAY,
      minDate: TODAY,
      returnTo: 'AttendanceEnrolments',
      context: 'start:e1',
    });

    // The picker pops back merging { pickedDate, context } onto this route —
    // simulate the return (the dispatch effect reads route.params once).
    await act(async () => {
      screen.renderer.update(
        <RosterScreen
          navigation={screen.navigation as never}
          route={{ params: { pickedDate: FUTURE, context: 'start:e1' } } as never}
        />,
      );
      await flush();
    });

    // The chip re-labels to the picked long date (a11y label carries it —
    // find() throws if the label is absent, so this is the assertion).
    pressableWithLabel(
      screen.root,
      `Starts ${formatLongDate(FUTURE)} for Priya, tap to change`,
    );

    // Toggle on → picker → pick office; the returned date rides along.
    const priyaToggle = pressableWithLabel(screen.root, 'Track attendance for Priya');
    await act(async () => {
      priyaToggle.props.onPress();
      await flush();
    });

    const pick = pressableWithLabel(screen.root, 'Assign HQ for Priya');
    await act(async () => {
      pick.props.onPress();
      await flush();
    });

    expect(enableMock).toHaveBeenCalledWith('e1', 'o1', FUTURE);
  });

  it('cancelling the picker writes nothing', async () => {
    const screen = await renderLoaded();
    const priyaToggle = pressableWithLabel(screen.root, 'Track attendance for Priya');
    await act(async () => {
      priyaToggle.props.onPress();
      await flush();
    });

    // Close the sheet the way dismissal reaches the screen: its onClose.
    const sheet = screen.root.find(
      (n) => n.props?.visible === true && n.props?.onPick && n.props?.onClose,
    );
    await act(async () => {
      sheet.props.onClose();
      await flush();
    });

    expect(enableMock).not.toHaveBeenCalled();
    expect(screen.root.findByType(OfficePickerSheet).props.visible).toBe(false);
  });
});

describe('upcoming rows', () => {
  it('an upcoming row opens the DatePicker pre-filled; the returned date restates the start through the enable PUT', async () => {
    const screen = await renderLoaded();
    enableMock.mockResolvedValue(
      writeState({ attendanceStartDate: isoShift(40) }),
    );

    const arjunRow = screen.root.find(
      (n) => n.props?.row?.employeeId === 'e3',
    );
    await act(async () => {
      arjunRow.props.onPickStart();
    });

    // Pre-filled with the row's CURRENT start (the long-form button label
    // and the picker must agree).
    expect(screen.navigation.navigate).toHaveBeenCalledWith('DatePicker', {
      title: 'Start date for Arjun',
      value: FUTURE,
      today: TODAY,
      minDate: TODAY,
      returnTo: 'AttendanceEnrolments',
      context: 'start:e3',
    });

    // The picker returns a NEW date → the enable PUT restates the start.
    await act(async () => {
      screen.renderer.update(
        <RosterScreen
          navigation={screen.navigation as never}
          route={{ params: { pickedDate: isoShift(40), context: 'start:e3' } } as never}
        />,
      );
      await flush();
    });

    expect(enableMock).toHaveBeenCalledWith('e3', 'o2', isoShift(40));
  });

  it('"Cancel the {date} start" asks through the ConfirmDialog, then DELETEs the future period', async () => {
    const screen = await renderLoaded();
    const cancel = pressableWithLabel(
      screen.root,
      `Cancel the ${formatLongDate(FUTURE)} start for Arjun`,
    );
    await act(async () => {
      cancel.props.onPress();
      await flush();
    });

    // The ask presents FIRST — nothing has deleted yet.
    const ask = confirmDialogUp(screen.root);
    expect(ask).not.toBeNull();
    expect(ask!.props.title).toBe(`Cancel the ${formatLongDate(FUTURE)} start?`);
    expect(disableMock).not.toHaveBeenCalled();

    // Confirm (Cancel start) DELETEs the period; "Keep start" would not.
    await act(async () => {
      ask!.props.onConfirm();
      await flush();
    });
    expect(disableMock).toHaveBeenCalledTimes(1);
    expect(disableMock).toHaveBeenCalledWith('e3');
  });

  it('"Keep start" on the ask sends NOTHING (cancel-safe by default)', async () => {
    const screen = await renderLoaded();
    const cancel = pressableWithLabel(
      screen.root,
      `Cancel the ${formatLongDate(FUTURE)} start for Arjun`,
    );
    await act(async () => {
      cancel.props.onPress();
      await flush();
    });
    const ask = confirmDialogUp(screen.root);
    expect(ask!.props.cancelLabel).toBe('Keep start');
    await act(async () => {
      ask!.props.onCancel();
      await flush();
    });
    expect(disableMock).not.toHaveBeenCalled();
    expect(confirmDialogUp(screen.root)).toBeNull();
  });

  it('turning tracking OFF asks through the ConfirmDialog, then DELETEs (idempotent)', async () => {
    const screen = await renderLoaded();
    // Ramesh covers today — the row toggle is the OFF path
    // (a never row's OFF does nothing: it is not tracked to turn off).
    const ramesh = pressableWithLabel(
      screen.root,
      'Track attendance for Ramesh',
    );
    await act(async () => {
      ramesh.props.onPress();
      await flush();
    });

    const ask = confirmDialogUp(screen.root);
    expect(ask).not.toBeNull();
    expect(ask!.props.title).toBe('Turn off tracking for Ramesh?');
    expect(ask!.props.cancelLabel).toBe('Keep tracking');
    expect(disableMock).not.toHaveBeenCalled();

    await act(async () => {
      ask!.props.onConfirm();
      await flush();
    });
    expect(disableMock).toHaveBeenCalledWith('e2');
  });
});

describe('reassignment (FR-6)', () => {
  it('Change office → sheet: select + confirm PUTs with an explicit effectiveFrom; a future move shows the note', async () => {
    const screen = await renderLoaded();
    // The future move's response still carries the OLD office — the view
    // cannot see the future; the note must stand in for it.
    reassignMock.mockResolvedValue(
      writeState({ officeId: 'o1', officeName: 'HQ' }),
    );

    const change = pressableWithLabel(screen.root, 'Change office for Ramesh');
    await act(async () => {
      change.props.onPress();
      await flush();
    });

    const sheet = screen.root.findByType(ReassignOfficeSheet);
    expect(sheet.props.visible).toBe(true);
    // Covering employee: the effective date defaults to (and cannot
    // precede) today.
    expect(sheet.props.defaultEffectiveFrom).toBe(TODAY);
    expect(sheet.props.minEffectiveFrom).toBe(TODAY);

    await act(async () => {
      sheet.props.onConfirm('o2', isoShift(7));
      await flush();
    });

    expect(reassignMock).toHaveBeenCalledWith('e2', 'o2', isoShift(7));
    expect(textContaining(screen.root, 'Moves to Branch from').length).toBe(1);
    // The row's own office line still shows the CURRENT truth.
    expect(textNodes(screen.root, 'Office: HQ').length).toBe(1);
  });
});
