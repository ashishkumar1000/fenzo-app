/**
 * Tests for EmployeesStep (Story 15-8, guarded by 15-9; 20-1 gate): the
 * roster rows render raw truth, and the 15-9 guard — an UPCOMING
 * (future-dated) row's switch is DISABLED with a "tracking begins then"
 * hint, because a bare enable PUT clamps the start date to today and
 * DELETES the future period (AD-8). Toggling it must be impossible from the
 * wizard; adjusting an upcoming enrolment is the Team enrolment screen's
 * job (spec-15-9).
 *
 * The 20-1 gate: turning a covered row's switch OFF asks through the shared
 * ConfirmDialog FIRST — the DELETE fires only after "Turn off tracking"
 * confirms; "Keep tracking" files NOTHING. First load shows the labelled
 * shimmer; a capped failure shows the error + Retry.
 */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, ConfirmDialog, Skeleton } from '../../../components/ui';
import { EmployeesStep } from './EmployeesStep';
import type { ApiError, EnrolmentOverview } from '../../../services';

const TODAY = '2026-09-28';

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

const NEVER = row();
const COVERING = row({
  employeeId: 'e2',
  employeeName: 'Ramesh',
  attendanceStartDate: TODAY,
  officeId: 'o1',
  officeName: 'HQ',
});
const UPCOMING = row({
  employeeId: 'e3',
  employeeName: 'Arjun',
  attendanceStartDate: '2026-11-01',
  officeId: 'o2',
  officeName: 'Branch',
});

type Props = Parameters<typeof EmployeesStep>[0];

function baseProps(): Props {
  return {
    roster: [],
    liveOffices: [],
    today: TODAY,
    isLoading: false,
    hasLoaded: true,
    error: null as ApiError | null,
    onRetry: () => {},
    rowError: () => null,
    isRowPending: () => false,
    onEnable: async () => true,
    onDisable: async () => true,
  };
}

describe('EmployeesStep — the 15-9 upcoming-row guard', () => {
  it('an upcoming row renders a DISABLED switch with the tracking-begins hint; toggling it PUTs nothing', async () => {
    const onEnable = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[UPCOMING]} onEnable={onEnable} />,
      );
    });

    const texts = renderer.root
      .findAll((n) => n.type === Text && typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(texts).toContain(
      `Starts 2026-11-01 \u00B7 tracking begins then \u2014 adjust from Team enrolment`,
    );

    const sw = renderer.root.find(
      (n) => n.props?.label === `Starts 2026-11-01 \u00B7 tracking begins then \u2014 adjust from Team enrolment`,
    );
    expect(sw.props.disabled).toBe(true);

    // Even a forced toggle fires no enable (the model-level invariant).
    await act(async () => {
      sw.props.onValueChange(true);
    });
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('the never-row switch stays enabled (the wizard enrolment-lite flow is untouched)', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[NEVER]} />,
      );
    });
    const sw = renderer.root.find(
      (n) => n.props?.label === 'Track attendance for Priya',
    );
    expect(sw.props.disabled).toBe(false);
  });

  it('the covering-row switch stays enabled', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[COVERING]} />,
      );
    });
    const sw = renderer.root.find(
      (n) => n.props?.label === 'Track attendance for Ramesh',
    );
    expect(sw.props.disabled).toBe(false);
  });
});

describe('EmployeesStep — the 20-1 switch-off gate', () => {
  let lastRenderer: ReturnType<typeof create> | null = null;

  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  /** Renders one roster and returns the OFF toggle plus the dialog finder. */
  function renderRoster(
    extra: Partial<ReturnType<typeof baseProps>> = {},
  ): { root: ReturnType<typeof create>['root'] } {
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          roster={[COVERING]}
          {...extra} />,
      );
    });
    lastRenderer = renderer;
    return { root: renderer.root as ReturnType<typeof create>['root'] };
  }

  function upDialog(root: ReturnType<typeof create>['root']) {
    return (
      root.findAllByType(ConfirmDialog).find((d) => d.props.visible === true) ??
      null
    );
  }

  it('turning a covered row OFF asks FIRST — no DELETE until "Turn off tracking" confirms', async () => {
    const onDisable = jest.fn(async () => true);
    const { root } = renderRoster({ onDisable });
    expect(upDialog(root)).toBeNull(); // nothing asks until the switch moves

    const sw = root.find(
      (n) => n.props?.label === 'Track attendance for Ramesh',
    );
    await act(async () => {
      sw.props.onValueChange(false);
    });
    expect(upDialog(root)).not.toBeNull();
    expect(onDisable).not.toHaveBeenCalled(); // the ask is not the write

    act(() => {
      upDialog(root)!.props.onConfirm();
    });
    expect(onDisable).toHaveBeenCalledWith('e2');
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('"Keep tracking" files NOTHING — the ask closes and the tracking stays', async () => {
    const onDisable = jest.fn(async () => true);
    const { root } = renderRoster({ onDisable });
    const sw = root.find(
      (n) => n.props?.label === 'Track attendance for Ramesh',
    );
    await act(async () => {
      sw.props.onValueChange(false);
    });
    act(() => {
      upDialog(root)!.props.onCancel();
    });
    expect(upDialog(root)).toBeNull();
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('a mid-flight row cannot even OPEN the ask (the switch-off guard bails on pending)', async () => {
    const onDisable = jest.fn(async () => true);
    const isRowPending = jest.fn((id: string) => id === 'e2');
    const { root } = renderRoster({ isRowPending });
    expect(upDialog(root)).toBeNull();

    const sw = root.find(
      (n) => n.props?.label === 'Track attendance for Ramesh',
    );
    await act(async () => {
      sw.props.onValueChange(false);
    });
    expect(upDialog(root)).toBeNull(); // never popped a second ask mid-flight
    expect(onDisable).not.toHaveBeenCalled();
  });
});

describe('EmployeesStep — 20-1 loading feedback', () => {
  let lastRenderer: ReturnType<typeof create> | null = null;

  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  function upDialog(root: ReturnType<typeof create>['root']) {
    return (
      root.findAllByType(ConfirmDialog).find((d) => d.props.visible === true) ??
      null
    );
  }

  it('first load with nothing loaded: the labelled shimmer — never "invite technicians first"', () => {
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} isLoading hasLoaded={false} />,
      );
    });
    lastRenderer = renderer;
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Loading attendance' }).length,
    ).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(
      renderer.root.findAll((n) => n.props.children === 'Invite technicians first').length,
    ).toBe(0);
  });

  it('a capped failure shows the error + Retry; Retry re-fires onRetry once', async () => {
    const onRetry = jest.fn();
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          hasLoaded={false}
          error={{ status: 500, message: 'down' } as unknown as ApiError}
          onRetry={onRetry} />,
      );
    });
    lastRenderer = renderer;
    expect(
      renderer.root.findAllByProps({ message: "Couldn't load your team. Check your connection and try again." }).length,
    ).toBeGreaterThan(0);
    expect(upDialog(renderer.root)).toBeNull();
    const btn = renderer.root.findAllByType(Button).find(
      (b) => b.props.children === 'Retry',
    );
    if (!btn) throw new Error('Retry button not found');
    await act(async () => {
      btn.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
