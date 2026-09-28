/**
 * Tests for EmployeesStep (Story 15-8, guarded by 15-9): the roster rows
 * render raw truth, and the 15-9 guard — an UPCOMING (future-dated) row's
 * switch is DISABLED with a "tracking begins then" hint, because a bare
 * enable PUT clamps the start date to today and DELETES the future period
 * (AD-8). Toggling it must be impossible from the wizard; adjusting an
 * upcoming enrolment is the Team enrolment screen's job (spec-15-9).
 */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
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
