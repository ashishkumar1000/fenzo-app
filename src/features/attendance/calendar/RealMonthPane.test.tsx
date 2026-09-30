/**
 * Tests for RealMonthPane's scope passthrough (Story 19-6, spec §5.5):
 * `employeeId` omitted → the hook receives the ME scope (fetchMyDayStatuses,
 * never the owner fetch — the self view's data is JWT-scoped server-side);
 * `employeeId` present → the owner fetch, byte-identical to the 19-5
 * behaviour (the drill-down pin lives on the host suite). The pane is REAL
 * with the service seam mocked (the house pane-test idiom).
 */
jest.mock('../../../services/resources/attendanceDayStatus', () => ({
  ...jest.requireActual('../../../services/resources/attendanceDayStatus'),
  fetchDayStatuses: jest.fn(),
  fetchMyDayStatuses: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import {
  fetchDayStatuses,
  fetchMyDayStatuses,
} from '../../../services/resources/attendanceDayStatus';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { RealMonthPane } from './RealMonthPane';

const fetchOwner = fetchDayStatuses as jest.Mock;
const fetchMe = fetchMyDayStatuses as jest.Mock;

function row(workDate: string): DayStatusRow {
  return {
    workDate,
    status: 'present',
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: 480,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: null,
    officeName: null,
    checkinAt: null,
    checkoutAt: null,
    checkinSource: null,
    checkoutSource: null,
    checkinDistanceM: null,
    checkoutDistanceM: null,
    markers: [],
  };
}

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderPane(props: { employeeId?: string }) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <RealMonthPane
        employeeId={props.employeeId}
        yearMonth="2026-09"
        onShiftMonth={() => undefined}
        onPickDay={() => undefined}
        onData={() => undefined}
      />,
    );
  });
  renderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  while (renderers.length > 0) {
    const renderer = renderers.pop()!;
    act(() => renderer.unmount());
  }
});

describe('RealMonthPane scope passthrough (19-6 D4)', () => {
  it('employeeId OMITTED → the me scope (fetchMyDayStatuses, no employee key on the wire)', async () => {
    fetchMe.mockResolvedValueOnce({
      from: '2026-09-01',
      to: '2026-09-30',
      today: '2026-09-29',
      days: [row('2026-09-14')],
    });

    renderPane({});

    expect(fetchMe).toHaveBeenCalledTimes(1);
    expect(fetchMe).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(fetchOwner).not.toHaveBeenCalled();
  });

  it('employeeId PRESENT → the owner fetch, unchanged 19-5 behaviour', async () => {
    fetchOwner.mockResolvedValueOnce({
      employeeId: 'e1',
      from: '2026-09-01',
      to: '2026-09-30',
      today: '2026-09-29',
      days: [row('2026-09-14')],
    });

    renderPane({ employeeId: 'e1' });

    expect(fetchOwner).toHaveBeenCalledTimes(1);
    expect(fetchOwner).toHaveBeenCalledWith('e1', '2026-09-01', '2026-09-30');
    expect(fetchMe).not.toHaveBeenCalled();
  });
});
