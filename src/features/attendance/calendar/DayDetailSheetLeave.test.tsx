/**
 * The day sheet's LEAVE surfaces (Story 20-1) — the CTA truth table and
 * the confirm-dialog gate, probed with plain props (the writes stay
 * host-owned; the hook's own suite is useMyMonthLeaveActions.test):
 *
 *  - "Apply leave" hides on ANY active-leave day (AC 1/5) — no second
 *    door to the same form; it stays on clean days.
 *  - "Cancel request": pending or approved, today INCLUDED and future —
 *    never a past day (approved past leave is settled fact; AC 7).
 *  - "Convert to full day": APPROVED half-day + strictly future ONLY
 *    (the wire cannot say WHICH half of a pending day, and converting
 *    today risks the checked-in conflict — AC 7). A pending half-day
 *    shows Cancel, never Convert.
 *  - AC 11: while the walk is in flight the CTAs are ABSENT under a
 *    labelled "Loading request" shimmer — never disabled, never blank.
 *  - 20-1 (user ask): every CTA pops the reusable ConfirmDialog first;
 *    its confirm enters the wire-safe stage; "Keep" files NOTHING.
 *  - the handled notice intercepts everything: OK = truth refetch +
 *    whole-sheet close.
 *
 * RTR gotcha honoured: a Modal keeps its children composed while
 * invisible — dialog presence reads `props.visible === true`
 * (ConfirmDialog found by type).
 */
jest.mock('../../../services/resources/attendanceCorrections', () => ({
  ...jest.requireActual('../../../services/resources/attendanceCorrections'),
  fetchCorrections: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { Button, ConfirmDialog, Skeleton } from '../../../components/ui';
import { ConvertStage } from './ConvertStage';
import { DayDetailSheet } from './DayDetailSheet';
import { CancelSheet } from '../leave/CancelSheet';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';

const TODAY = '2026-10-01';

function day(overrides: Partial<DayStatusRow> = {}): DayStatusRow {
  return {
    workDate: '2026-10-14',
    status: 'leave',
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: null,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: 'o1',
    officeName: 'Andheri',
    checkinAt: null,
    checkoutAt: null,
    checkinSource: 'gps',
    checkoutSource: 'gps',
    checkinDistanceM: null,
    checkoutDistanceM: null,
    markers: [],
    ...overrides,
    leaveRequestId: overrides.leaveRequestId ?? 'lr-leave',
  };
}

/** A resolved covering request — the CTA gate's input (AC 11). */
function request(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'lr-leave',
    employeeId: 'e1',
    startDate: '2026-10-14',
    endDate: '2026-10-14',
    part: 'full_day',
    reason: 'Family function',
    status: 'approved',
    workingDays: 1,
    totalDays: 1,
    createdBy: 'e1',
    createdAt: '2026-09-30T10:00:00Z',
    dates: [{ date: '2026-10-14', state: 'approved' }],
    ...overrides,
  };
}

type Props = Parameters<typeof DayDetailSheet>[0];

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

function renderSheet(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  // The owner plumbing keeps the leave CTAs on (they only render in the
  // detail stage — the Correct entry may coexist, never a conflict).
  const base: Partial<Props> = {
    visible: true,
    workDate: '2026-10-14',
    today: TODAY,
    scope: { kind: 'owner', employeeId: 'e1' },
    // The host callbacks, wired by default — the CTA gates take them as
    // inputs (absent = no entry renders, the D1 posture).
    onCancelLeave: jest.fn(),
    onConvertFullDay: jest.fn(),
    onApplyLeave: jest.fn(),
  };
  const merged = { ...base, ...props };
  // baseProps carries a `day` only when the caller gave none.
  const full: Props = {
    day: day(),
    ...merged,
  } as Props;
  act(() => {
    renderer = create(<DayDetailSheet {...full} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function buttonByLabel(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance | undefined {
  return root.findAllByType(Button).find(b =>
    Array.isArray(b.props.children)
      ? b.props.children.join('') === label
      : b.props.children === label,
  );
}

/** The dialog PRESENTED (Modal children stay composed while invisible). */
function upDialog(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(ConfirmDialog).find(d => d.props.visible === true) ?? null;
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

describe('the CTA truth table (ACs 1/2/5/7)', () => {
  it('an APPROVED half-day FUTURE: Convert primary + Cancel, and "Apply leave" is GONE', () => {
    const root = renderSheet({
      day: day({ status: 'half_day_leave' }),
      leaveRequest: request({ part: 'first_half', status: 'approved' }),
    });
    expect(buttonByLabel(root, 'Convert to full day')).toBeDefined();
    expect(buttonByLabel(root, 'Cancel request')).toBeDefined();
    expect(texts(root).includes('Apply leave')).toBe(false);
  });

  it('a PENDING leave FUTURE (any part): Cancel, never Convert. The wire never echoes `half_day_leave` for a pending leave — the day reads `not_checked_in_yet` + the marker, and the convert gate can never fire on that shape', () => {
    const root = renderSheet({
      // The WIRE shape (BE rule 10): a pending leave on a future date is a
      // not-checked-in day + the pending marker — never `half_day_leave`.
      day: day({ status: 'not_checked_in_yet', markers: ['leave_pending'] }),
      leaveRequest: request({ part: 'second_half', status: 'pending' }),
    });
    expect(buttonByLabel(root, 'Cancel request')).toBeDefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
  });

  it('a FULL-day pending leave FUTURE: Cancel, no Convert (same wire shape)', () => {
    const root = renderSheet({
      day: day({ status: 'not_checked_in_yet', markers: ['leave_pending'] }),
      leaveRequest: request({ status: 'pending' }),
    });
    expect(buttonByLabel(root, 'Cancel request')).toBeDefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
  });

  it('TODAY: Cancel stays (the stage\'s preview governs the wire), Convert drops (the checked-in conflict)', () => {
    const root = renderSheet({
      workDate: TODAY,
      today: TODAY,
      day: day({ workDate: TODAY, status: 'half_day_leave' }),
      leaveRequest: request({
        startDate: TODAY,
        endDate: TODAY,
        dates: [{ date: TODAY, state: 'approved' }],
      }),
    });
    expect(buttonByLabel(root, 'Cancel request')).toBeDefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
  });

  it('a PAST approved leave day: no CTAs at all — settled fact', () => {
    const root = renderSheet({
      workDate: '2026-09-20',
      day: day({ workDate: '2026-09-20' }),
    });
    expect(buttonByLabel(root, 'Cancel request')).toBeUndefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
    expect(texts(root).includes('Apply leave')).toBe(false);
  });

  it('a CLEAN day keeps "Apply leave" (the request props change nothing there)', () => {
    const root = renderSheet({
      day: { ...day({ status: 'present' }), leaveRequestId: null },
      leaveRequest: request(),
    });
    expect(texts(root).includes('Apply leave')).toBe(true);
    expect(buttonByLabel(root, 'Cancel request')).toBeUndefined();
  });
});

describe('AC 11 — the unresolved covering request', () => {
  it('a leave day still resolving shows the labelled shimmer and NO CTAs (absent, not disabled)', () => {
    const root = renderSheet({ leaveResolving: true, leaveRequest: null });
    expect(
      root.findAllByProps({ accessibilityLabel: 'Loading request' }).length,
    ).toBeGreaterThan(0);
    expect(root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(buttonByLabel(root, 'Cancel request')).toBeUndefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
  });

  it('resolved to null (capped miss): no shimmer, no CTAs — history stays the surface', () => {
    const root = renderSheet({ leaveResolving: false, leaveRequest: null });
    expect(root.findAllByProps({ accessibilityLabel: 'Loading request' })).toHaveLength(0);
    expect(buttonByLabel(root, 'Cancel request')).toBeUndefined();
  });
});

describe('the confirm-then-stage gate (20-1 user ask)', () => {
  it('pressing Cancel asks through the ConfirmDialog; the confirm enters the CancelSheet stage', async () => {
    const root = renderSheet({
      day: day(),
      leaveRequest: request(),
    });
    const ask = upDialog(root);
    expect(ask).toBeNull(); // nothing asks until the CTA is pressed
    const cta = buttonByLabel(root, 'Cancel request')!;
    act(() => {
      cta.props.onPress();
    });
    const dialog = upDialog(root);
    expect(dialog).not.toBeNull();
    expect(dialog!.props.title).toBe('Cancel leave request?');
    expect(dialog!.props.confirmLabel).toBe('Cancel request');
    expect(dialog!.props.cancelLabel).toBe('Keep request');
    // Keep files NOTHING.
    act(() => {
      dialog!.props.onCancel();
    });
    expect(upDialog(root)).toBeNull();
    expect(texts(root).includes('Cancellation request received')).toBe(false);
    // The confirm enters the stage (the sheet's CancelSheet mounts).
    act(() => {
      cta.props.onPress();
    });
    const ask2 = upDialog(root)!;
    act(() => {
      ask2.props.onConfirm();
    });
    expect(root.findAllByType(CancelSheet)).toHaveLength(1);
  });

  it('pressing Convert asks "Convert to full day?"; the confirm enters the convert stage', () => {
    const root = renderSheet({
      day: day({ status: 'half_day_leave' }),
      leaveRequest: request({ part: 'first_half' }),
    });
    const cta = buttonByLabel(root, 'Convert to full day')!;
    act(() => {
      cta.props.onPress();
    });
    const dialog = upDialog(root)!;
    expect(dialog.props.title).toBe('Convert to full day?');
    expect(dialog.props.confirmLabel).toBe('Cancel and send new request');
    expect(dialog.props.cancelLabel).toBe('Keep half day');
    // Keep files NOTHING — the sheet stays on the detail stage.
    act(() => {
      dialog.props.onCancel();
    });
    expect(upDialog(root)).toBeNull();
    // Confirm → the convert stage renders.
    act(() => {
      cta.props.onPress();
    });
    act(() => {
      upDialog(root)!.props.onConfirm();
    });
    expect(root.findAllByType(ConvertStage)).toHaveLength(1);
  });
});

describe('the handled notice (AC 9)', () => {
  it('intercepts EVERYTHING: only the notice + OK; OK refetches truth and closes the WHOLE sheet', () => {
    const onClose = jest.fn();
    const onLeaveWriteHandled = jest.fn();
    const root = renderSheet({
      day: day(),
      leaveRequest: request(),
      leaveActionState: { kind: 'handled' },
      onClose,
      onLeaveWriteHandled,
    });
    expect(texts(root).includes('This request was already handled')).toBe(true);
    expect(buttonByLabel(root, 'Cancel request')).toBeUndefined();
    expect(buttonByLabel(root, 'Convert to full day')).toBeUndefined();
    const ok = buttonByLabel(root, 'OK')!;
    act(() => {
      ok.props.onPress();
    });
    expect(onLeaveWriteHandled).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the write-settle morph (the 17-7 shape)', () => {
  it('submitting → idle morphs back to detail and announces the outcome', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DayDetailSheet
          {...({
            visible: true,
            workDate: '2026-10-14',
            today: TODAY,
            day: day(),
            leaveRequest: request(),
            leaveActionState: { kind: 'submitting', action: 'cancel' },
            scope: { kind: 'owner', employeeId: 'e1' },
          } as Props)} />,
      );
    });
    lastRenderer = renderer;
    const props = {
      ...({} as Props),
    };
    void props;
    // Settle to idle — the write landed.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...({
            visible: true,
            workDate: '2026-10-14',
            today: TODAY,
            day: day(),
            leaveRequest: request(),
            leaveActionState: { kind: 'idle' },
            scope: { kind: 'owner', employeeId: 'e1' },
          } as Props)} />,
      );
    });
    expect(announce).toHaveBeenCalledWith('Leave cancelled');
    expect(texts(renderer.root).includes('This request was already handled')).toBe(false);
  });
});