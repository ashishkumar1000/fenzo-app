/**
 * Pure-model tests for `enrolmentsModel` (Story 15-9): the raw-truth
 * helpers (never the TENANT-module flag — see the 15-8 device-found rule),
 * the start-chip copy + midnight degradation, the reassign sheet defaults,
 * and the scheduled-move settle conditions.
 */
import {
  enrolmentCoversToday,
  isMoveSettled,
  reassignSheetDefaults,
  rowState,
  startChipLabel,
  startChipParam,
  upcomingStart,
  type ScheduledMove,
} from './enrolmentsModel';

const TODAY = '2026-09-28';

describe('raw-truth helpers (never the module flag)', () => {
  it('enrolmentCoversToday: null never covers (null = not enrolled)', () => {
    expect(enrolmentCoversToday({ attendanceStartDate: null }, TODAY)).toBe(false);
  });

  it('enrolmentCoversToday: start <= today covers, future does not', () => {
    expect(enrolmentCoversToday({ attendanceStartDate: TODAY }, TODAY)).toBe(true);
    expect(enrolmentCoversToday({ attendanceStartDate: '2026-09-27' }, TODAY)).toBe(true);
    expect(enrolmentCoversToday({ attendanceStartDate: '2026-09-29' }, TODAY)).toBe(false);
  });

  it('rowState partitions never / upcoming / covering', () => {
    expect(rowState({ attendanceStartDate: null }, TODAY)).toBe('never');
    expect(rowState({ attendanceStartDate: '2026-11-01' }, TODAY)).toBe('upcoming');
    expect(rowState({ attendanceStartDate: TODAY }, TODAY)).toBe('covering');
  });

  it('upcomingStart yields only strict future starts', () => {
    expect(upcomingStart({ attendanceStartDate: '2026-11-01' }, TODAY)).toBe('2026-11-01');
    expect(upcomingStart({ attendanceStartDate: TODAY }, TODAY)).toBeNull();
    expect(upcomingStart({ attendanceStartDate: null }, TODAY)).toBeNull();
  });
});

describe('the start chip', () => {
  it('labels: nothing picked / today / stale past pick all read "Starts today"', () => {
    expect(startChipLabel(null, TODAY)).toBe('Starts today');
    expect(startChipLabel(TODAY, TODAY)).toBe('Starts today');
    expect(startChipLabel('2026-09-20', TODAY)).toBe('Starts today'); // midnight degradation
  });

  it('labels: a future pick reads the long form', () => {
    expect(startChipLabel('2026-11-01', TODAY)).toBe('Starts Sun, 1 Nov, 2026');
  });

  it('params: only a strict future date reaches the wire; null/undefined/past are omitted', () => {
    expect(startChipParam('2026-11-01', TODAY)).toBe('2026-11-01');
    expect(startChipParam(null, TODAY)).toBeUndefined();
    expect(startChipParam(undefined, TODAY)).toBeUndefined();
    expect(startChipParam(TODAY, TODAY)).toBeUndefined();
    expect(startChipParam('2026-09-20', TODAY)).toBeUndefined(); // the wire never carries a past date
  });
});

describe('reassignSheetDefaults', () => {
  it('a covering employee moves from today, min today (FR-6: the date made or future)', () => {
    expect(reassignSheetDefaults({ attendanceStartDate: TODAY }, TODAY)).toEqual({
      effectiveFrom: TODAY,
      minDate: TODAY,
    });
    expect(reassignSheetDefaults({ attendanceStartDate: '2026-09-01' }, TODAY)).toEqual({
      effectiveFrom: TODAY,
      minDate: TODAY,
    });
  });

  it('an upcoming employee defaults to (and cannot precede) their enrolment start', () => {
    expect(reassignSheetDefaults({ attendanceStartDate: '2026-11-01' }, TODAY)).toEqual({
      effectiveFrom: '2026-11-01',
      minDate: '2026-11-01',
    });
  });

  it('a never-enrolled row falls back to the covering case defensively (no reassign affordance exists)', () => {
    expect(reassignSheetDefaults({ attendanceStartDate: null }, TODAY)).toEqual({
      effectiveFrom: TODAY,
      minDate: TODAY,
    });
  });
});

describe('isMoveSettled — when the scheduled-move note retires', () => {
  const MOVE: ScheduledMove = { officeId: 'o2', effectiveFrom: '2026-11-01' };

  it('a vanished row is settled', () => {
    expect(isMoveSettled(undefined, MOVE, TODAY)).toBe(true);
  });

  it('a row that stopped being enrolled is settled (a disable cancelled the move)', () => {
    expect(
      isMoveSettled({ attendanceStartDate: null, officeId: null }, MOVE, TODAY),
    ).toBe(true);
  });

  it('the move taking effect settles it (its office now covers today — the row says it itself)', () => {
    expect(
      isMoveSettled({ attendanceStartDate: '2026-11-01', officeId: 'o2' }, MOVE, '2026-11-01'),
    ).toBe(true);
  });

  it('the row already showing the target office covering today settles it too (the note is redundant)', () => {
    expect(
      isMoveSettled({ attendanceStartDate: TODAY, officeId: 'o2' }, MOVE, TODAY),
    ).toBe(true);
  });

  it('the move date arriving with a DIFFERENT office settles it (undone by a disable/re-enable elsewhere)', () => {
    expect(
      isMoveSettled({ attendanceStartDate: '2026-09-20', officeId: 'o1' }, MOVE, '2026-11-02'),
    ).toBe(true);
  });

  it('before the move date, with the old office still covering, the note stands', () => {
    expect(
      isMoveSettled({ attendanceStartDate: '2026-09-20', officeId: 'o1' }, MOVE, TODAY),
    ).toBe(false);
  });

  it('an UPCOMING row already showing the moved-to office at its start settles immediately (the view anchors upcoming at the next start — the note would duplicate the row)', () => {
    expect(
      isMoveSettled(
        { attendanceStartDate: '2026-11-01', officeId: 'o2' },
        { officeId: 'o2', effectiveFrom: '2026-11-01' },
        TODAY,
      ),
    ).toBe(true);
    // A DIFFERENT future office for an upcoming row still deserves the note
    // (a scheduled move beyond their start).
    expect(
      isMoveSettled(
        { attendanceStartDate: '2026-11-01', officeId: 'o1' },
        MOVE,
        TODAY,
      ),
    ).toBe(false);
  });
});
