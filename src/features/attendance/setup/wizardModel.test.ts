/**
 * Direct unit tests for the 15-8 setup wizard's pure model:
 *  - SETUP_STEPS mirrors 15-2's DB CHECK vocabulary in UX-DR6 order (a
 *    resumed server `currentStep` is an index into THIS list — reordering
 *    shipped wizards would corrupt every in-flight resume).
 *  - stepIndex/stepNumber/next/previous edges.
 *  - continueGateReason per step: offices needs a live office; timings
 *    needs every live office ruled; weekly_off needs a saved canonical
 *    default — a saved EMPTY set (days: [], the works-all-week rule) is a
 *    real view and COUNTS as saved, only null gates (the screen maps
 *    `defaultView === null` to null); holidays is always continuable (the
 *    only skippable step); employees has no Continue gate (Enable owns it).
 *  - completionGateReason mirrors the server's completion rule 1:1,
 *    including the covers-today condition (a FUTURE-dated enrolment must
 *    not satisfy the mirror) and the live-office requirement for the
 *    covering assignment.
 */
import type { EnrolmentOverview, SetupStep } from '../../../services';
import type { Office } from '../../../types/office';
import {
  SETUP_STEPS,
  STEP_TITLES,
  completionGateReason,
  continueGateReason,
  liveOffices,
  nextStep,
  previousStep,
  stepIndex,
  stepNumber,
} from './wizardModel';
import type { StepGateSnapshot } from './wizardModel';

function office(id: string, overrides: Partial<Office> = {}): Office {
  return {
    id,
    name: `Office ${id}`,
    latitude: 19.1,
    longitude: 72.8,
    radiusM: 100,
    archivedAt: null,
    rule: {
      id: `rule-${id}`,
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      validFrom: '2026-09-01',
      validTo: null,
    },
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
    officeId: 'o1',
    officeName: 'Office o1',
    ...overrides,
  };
}

const TODAY = '2026-09-28';

describe('SETUP_STEPS — the walking order', () => {
  it('mirrors the DB CHECK vocabulary in UX-DR6 order', () => {
    expect(SETUP_STEPS).toEqual([
      'offices',
      'timings',
      'weekly_off',
      'holidays',
      'employees',
    ]);
  });

  it('every step has a title and a description', () => {
    for (const step of SETUP_STEPS) {
      expect(STEP_TITLES[step].length).toBeGreaterThan(0);
    }
  });
});

describe('stepIndex / stepNumber', () => {
  it('is 0-based in the model and 1-based for the StepIndicator', () => {
    expect(stepIndex('offices')).toBe(0);
    expect(stepNumber('offices')).toBe(1);
    expect(stepIndex('employees')).toBe(4);
    expect(stepNumber('employees')).toBe(5);
  });
});

describe('nextStep / previousStep', () => {
  it('walks forward and stops at Employees (Enable owns that step)', () => {
    expect(nextStep('offices')).toBe('timings');
    expect(nextStep('holidays')).toBe('employees');
    expect(nextStep('employees')).toBeNull();
  });

  it('walks backward and stops at Offices (the marker never does)', () => {
    expect(previousStep('timings')).toBe('offices');
    expect(previousStep('employees')).toBe('holidays');
    expect(previousStep('offices')).toBeNull();
  });
});

describe('liveOffices', () => {
  it('counts only offices with archivedAt === null', () => {
    const offices = [
      office('o1'),
      office('o2', { archivedAt: '2026-09-20T00:00:00Z' }),
    ];
    expect(liveOffices(offices).map((o) => o.id)).toEqual(['o1']);
    expect(liveOffices([])).toEqual([]);
  });
});

describe('continueGateReason', () => {
  const base: StepGateSnapshot = {
    liveOfficeCount: 1,
    liveOfficesMissingRule: 0,
    weeklyOffDefaultDays: [7],
  };

  it('offices: zero live offices blocks with its caption; one enables', () => {
    expect(
      continueGateReason('offices', { ...base, liveOfficeCount: 0 }),
    ).toBe('Add at least one office to continue.');
    expect(continueGateReason('offices', base)).toBeNull();
  });

  it('timings: zero live offices blocks with the OFFICES caption', () => {
    expect(
      continueGateReason('timings', { ...base, liveOfficeCount: 0 }),
    ).toBe('Add at least one office to continue.');
  });

  it('timings: a live office missing its rule blocks', () => {
    expect(
      continueGateReason('timings', { ...base, liveOfficesMissingRule: 1 }),
    ).toBe('Every office needs its timings set before you continue.');
  });

  it('timings: every live office ruled enables', () => {
    expect(continueGateReason('timings', base)).toBeNull();
  });

  it('weekly_off: no saved default blocks with its caption', () => {
    expect(
      continueGateReason('weekly_off', { ...base, weeklyOffDefaultDays: null }),
    ).toBe('Save your default weekly off first.');
  });

  it('weekly_off: a saved EMPTY default (days: [], works-all-week) counts as saved', () => {
    expect(
      continueGateReason('weekly_off', { ...base, weeklyOffDefaultDays: [] }),
    ).toBeNull();
  });

  it('weekly_off: a saved non-empty default enables', () => {
    expect(continueGateReason('weekly_off', base)).toBeNull();
  });

  it('holidays is ALWAYS continuable — the only skippable step', () => {
    const empty = {
      liveOfficeCount: 0,
      liveOfficesMissingRule: 0,
      weeklyOffDefaultDays: null,
    };
    expect(continueGateReason('holidays', empty)).toBeNull();
    expect(continueGateReason('holidays', base)).toBeNull();
  });

  it('employees carries no Continue gate (the Enable gate owns the step)', () => {
    const empty = {
      liveOfficeCount: 0,
      liveOfficesMissingRule: 0,
      weeklyOffDefaultDays: null,
    };
    expect(continueGateReason('employees', empty)).toBeNull();
  });
});

describe('completionGateReason', () => {
  const gate = (offices: Office[], roster: EnrolmentOverview[]) =>
    completionGateReason({ offices, roster, today: TODAY });

  it('zero offices at all blocks with the office caption', () => {
    expect(gate([], [row()])).toBe(
      'Add at least one office to enable attendance.',
    );
  });

  it('only archived offices blocks the same way (the live set is what counts)', () => {
    const archived = office('o1', { archivedAt: '2026-09-20T00:00:00Z' });
    expect(gate([archived], [row()])).toBe(
      'Add at least one office to enable attendance.',
    );
  });

  it('a covered row with NO office does not satisfy the gate', () => {
    expect(gate([office('o1')], [row({ officeId: null, officeName: null, attendanceStartDate: TODAY })])).toBe(
      'Turn on attendance for at least one employee assigned to a live office, starting today.',
    );
  });

  it('an enabled row whose office is NOT in the live set does not satisfy the gate', () => {
    // A live office exists, but the row's assignment points at a DIFFERENT,
    // archived/unknown id — the covering assignment must be live.
    expect(gate([office('o1')], [row({ officeId: 'o9', officeName: 'Gone', attendanceStartDate: TODAY })])).toBe(
      'Turn on attendance for at least one employee assigned to a live office, starting today.',
    );
  });

  it('the kill-switch-gated module flag does NOT block the gate (raw enrolment truth is what counts)', () => {
    // Mid-setup shape: settings disabled → the wire's attendanceEnabled is
    // false for EVERY row, yet the enrolment covers today with a live
    // office — exactly the wizard's working state (device-found bug: the
    // gate once read the module flag and could never open).
    expect(
      gate(
        [office('o1')],
        [row({ attendanceEnabled: false, attendanceStartDate: TODAY })],
      ),
    ).toBeNull();
  });

  it('a FUTURE-dated enrolment does not satisfy the gate (covers-today mirror)', () => {
    const future = row({ attendanceStartDate: '2026-09-29' });
    expect(gate([office('o1')], [future])).toBe(
      'Turn on attendance for at least one employee assigned to a live office, starting today.',
    );
  });

  it('an enrolment starting TODAY satisfies the gate', () => {
    const today = row({ attendanceStartDate: TODAY });
    expect(gate([office('o1')], [today])).toBeNull();
  });

  it('a past-dated enrolment satisfies the gate (still covering)', () => {
    const past = row({ attendanceStartDate: '2026-09-01' });
    expect(gate([office('o1')], [past])).toBeNull();
  });

  it('a null start date does NOT satisfy the gate (null = NOT enrolled, never covers-today)', () => {
    expect(gate([office('o1')], [row()])).toBe(
      'Turn on attendance for at least one employee assigned to a live office, starting today.',
    );
  });

  it('only ONE satisfying row is needed among many', () => {
    const roster = [
      row({ employeeId: 'e1', attendanceEnabled: false }),
      row({ employeeId: 'e2', attendanceStartDate: '2026-10-01' }),
      row({ employeeId: 'e3', attendanceStartDate: '2026-09-15' }),
    ];
    expect(gate([office('o1')], roster)).toBeNull();
  });
});
