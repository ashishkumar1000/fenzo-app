/**
 * Component tests for DayDetailLeaveStages (Story 20-1, AC 8/11) — the
 * stage mount mapping and the CTA gate:
 *  - `convert` mounts ConvertStage with the host's submitting/failure
 *    state passed straight through (the sheet renders; the host decides).
 *  - `leaveCancel` mounts the REUSED CancelSheet (the 17-7 stage verbatim:
 *    request view + submitting + failure + onDismissHandled routing).
 *  - an UNRESOLVED covering request (null) returns null — the caller's
 *    condition chain falls through to the detail stage, so a vanishing
 *    resolution can never blank a sheet (the AC 11 posture).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ConvertStage } from './ConvertStage';
import { DayDetailLeaveStages } from './DayDetailLeaveStages';
import { CancelSheet } from '../leave/CancelSheet';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';

jest.mock('../leave/CancelSheet', () => ({
  CancelSheet: jest.fn(() => null),
}));

const request: LeaveRequestRow = {
  id: 'lr1',
  employeeId: 'e1',
  startDate: '2026-10-03',
  endDate: '2026-10-03',
  part: 'first_half',
  reason: 'Not feeling well',
  status: 'approved',
  workingDays: 0.5,
  totalDays: 1,
  createdBy: 'e1',
  createdAt: '2026-09-30T10:00:00Z',
  dates: [{ date: '2026-10-03', state: 'approved' }],
};

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

function renderStages(props: Partial<Parameters<typeof DayDetailLeaveStages>[0]> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<DayDetailLeaveStages {...baseProps(props)} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

function baseProps(
  overrides: Partial<Parameters<typeof DayDetailLeaveStages>[0]> = {},
): Parameters<typeof DayDetailLeaveStages>[0] {
  return {
    stage: 'leaveCancel',
    workDate: '2026-10-03',
    leaveRequest: request,
    submitting: false,
    errorMessage: null,
    onBack: jest.fn(),
    onConfirm: jest.fn(),
    onHandled: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

it(`convert mounts the ConvertStage with the host state handed straight through`, () => {
  const root = renderStages({
    stage: 'convert',
    submitting: true,
    errorMessage: 'Down. Your half-day request is already cancelled.',
  });
  expect(root.findAllByType(ConvertStage)).toHaveLength(1);
  const stage = root.findAllByType(ConvertStage)[0];
  expect(stage.props.workDate).toBe('2026-10-03');
  expect(stage.props.submitting).toBe(true);
  expect(stage.props.errorMessage).toBe('Down. Your half-day request is already cancelled.');
});

it(`leaveCancel mounts the REUSED CancelSheet with the handled-OK routing`, () => {
  const root = renderStages({ stage: 'leaveCancel' });
  expect(root.findAllByType(CancelSheet)).toHaveLength(1);
  const sheet = root.findAllByType(CancelSheet)[0];
  expect(sheet.props.request).toEqual(request);
  expect(sheet.props.submitting).toBe(false);
  expect(sheet.props.onDismissHandled).toBe(root.findAllByType(DayDetailLeaveStages)[0].props.onHandled);
});

it(`an UNRESOLVED covering request renders NOTHING — never a blanked sheet or a dead CTA`, () => {
  for (const stage of ['leaveCancel', 'convert'] as const) {
    const root = renderStages({ stage, leaveRequest: null });
    expect(root.findAllByType(ConvertStage)).toHaveLength(0);
    expect(root.findAllByType(CancelSheet)).toHaveLength(0);
  }
});