/**
 * The D1 visual table (Story 18-3, spec §3 test plan): 12/12 wire keys
 * covered with exact {badgeStatus, icon, label} identities; distinct icons
 * WITHIN each hue family (the amber Clock-vs-AlertCircle pair, the blue
 * trio, the four neutral glyphs, the green pair) — coverage only: the
 * production proof is the hosted month surfaces' walkthroughs (the 19-6
 * self view is the third consumer; the Floor rejects token-table-only
 * evidence). Plus the flag-tag derivation.
 */
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  MinusCircle,
  Moon,
  Pencil,
  Play,
  ShieldAlert,
  XCircle,
} from 'lucide-react-native';
import { colors } from '../../../theme';
import type { DayStatusKey, DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import {
  DAY_STATUS_VISUALS,
  dayFlagVisuals,
  dayStatusColors,
} from './dayStatusVisual';

/** Every wire key, once — the exhaustive list every consumer maps through. */
const ALL_KEYS: DayStatusKey[] = [
  'not_tracked',
  'not_checked_in_yet',
  'in_progress',
  'weekly_off',
  'holiday',
  'worked_on_holiday',
  'leave',
  'half_day_leave',
  'present',
  'half_day',
  'absent',
  'checkout_missing',
];

function row(overrides: Partial<DayStatusRow> = {}): DayStatusRow {
  return {
    workDate: '2026-09-14',
    status: 'present',
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
    officeId: null,
    officeName: null,
    checkinAt: null,
    checkoutAt: null,
    checkinSource: null,
    checkoutSource: null,
    checkinDistanceM: null,
    checkoutDistanceM: null,
    markers: [],
    ...overrides,
    // 20-1 — leaveRequestId normalizes AFTER the spread (Partial leaks
    // undefined through it); only the leave-day rows carry a UUID.
    leaveRequestId: overrides.leaveRequestId ?? null,

  };
}

describe('DAY_STATUS_VISUALS — the 12/12 table', () => {
  it('covers every wire key exactly once', () => {
    expect(Object.keys(DAY_STATUS_VISUALS).sort()).toEqual(
      [...ALL_KEYS].sort(),
    );
  });

  it.each([
    ['present', 'done', CheckCircle2, 'Present'],
    ['half_day', 'scheduled', Clock, 'Half day'],
    ['absent', 'cancelled', XCircle, 'Absent'],
    ['leave', 'leave', CalendarOff, 'Leave'],
    ['half_day_leave', 'halfDayLeave', CalendarClock, 'Half-day leave'],
    ['weekly_off', 'weeklyOff', Moon, 'Weekly off'],
    ['holiday', 'holiday', Flag, 'Holiday'],
    ['worked_on_holiday', 'workedHoliday', Briefcase, 'Worked on holiday'],
    ['checkout_missing', 'checkoutMissing', AlertCircle, 'Check-out missing'],
    ['not_tracked', 'notTracked', MinusCircle, 'Not tracked'],
    ['not_checked_in_yet', 'notCheckedIn', Circle, 'Not checked in yet'],
    ['in_progress', 'progress', Play, 'In progress'],
  ] as const)(
    '%s → %s / the DESIGN.md icon + verbatim label',
    (key, badgeStatus, icon, label) => {
      expect(DAY_STATUS_VISUALS[key]).toEqual({
        badgeStatus,
        icon,
        label,
      });
    },
  );

  it('in_progress renders on the EXISTING progress key (no 9th blue key)', () => {
    expect(DAY_STATUS_VISUALS.in_progress.badgeStatus).toBe('progress');
    expect(DAY_STATUS_VISUALS.in_progress.icon).toBe(Play);
  });

  it('labels are unique across the table (verbatim DESIGN.md copy)', () => {
    const labels = Object.values(DAY_STATUS_VISUALS).map(v => v.label);
    expect(new Set(labels).size).toBe(12);
  });
});

describe('distinct icons within each hue family (coverage only)', () => {
  const familyOf = (badgeStatus: string) => colors.status[badgeStatus as keyof typeof colors.status].bg;

  function iconsInFamily(familyBg: string) {
    return Object.values(DAY_STATUS_VISUALS)
      .filter(v => familyOf(v.badgeStatus) === familyBg)
      .map(v => v.icon);
  }

  it('amber (partial): Half day vs Check-out missing', () => {
    const icons = iconsInFamily(colors.status.scheduled.bg);
    expect(icons).toContain(Clock);
    expect(icons).toContain(AlertCircle);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('blue (planned): Leave / Half-day leave / In progress', () => {
    const icons = iconsInFamily(colors.status.progress.bg);
    expect(icons).toHaveLength(3);
    expect(new Set(icons).size).toBe(3);
  });

  it('gray (neutral): the four neutral glyphs all differ', () => {
    const icons = iconsInFamily(colors.status.neutral.bg);
    expect(icons).toHaveLength(4);
    expect(new Set(icons).size).toBe(4);
  });

  it('green (worked): Present vs Worked on holiday', () => {
    const icons = iconsInFamily(colors.status.done.bg);
    expect(icons).toContain(CheckCircle2);
    expect(icons).toContain(Briefcase);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('red (blocked): Absent alone', () => {
    const icons = iconsInFamily(colors.status.cancelled.bg);
    expect(icons).toEqual([XCircle]);
  });
});

describe('dayStatusColors — the Badge-soft mapping', () => {
  it('returns exactly the family colours Badge tone="soft" renders', () => {
    expect(dayStatusColors('present')).toBe(colors.status.done);
    expect(dayStatusColors('in_progress')).toBe(colors.status.progress);
    expect(dayStatusColors('checkout_missing')).toBe(
      colors.status.checkoutMissing,
    );
  });
});

describe('dayFlagVisuals — the DESIGN.md Flag table', () => {
  it('Late {n} min (amber, AlertCircle)', () => {
    const flags = dayFlagVisuals(row({ isLate: true, lateMinutes: 22 }));
    expect(flags).toEqual([
      {
        key: 'late',
        badgeStatus: 'checkoutMissing',
        icon: AlertCircle,
        label: 'Late 22 min',
      },
    ]);
  });

  it('Late without minutes renders the bare word', () => {
    const flags = dayFlagVisuals(row({ isLate: true, lateMinutes: null }));
    expect(flags[0].label).toBe('Late');
  });

  it('Early {n} min (amber, AlertCircle)', () => {
    const flags = dayFlagVisuals(
      row({ earlyCheckout: true, earlyCheckoutMinutes: 15 }),
    );
    expect(flags).toEqual([
      {
        key: 'early',
        badgeStatus: 'checkoutMissing',
        icon: AlertCircle,
        label: 'Early 15 min',
      },
    ]);
  });

  it('Fake location (red, ShieldAlert) + Leave pending (neutral, Clock) + Corrected (neutral, Pencil)', () => {
    const flags = dayFlagVisuals(
      row({
        markers: ['corrected', 'leave_pending', 'fake_location_attempt'],
      }),
    );
    expect(flags.map(f => [f.key, f.badgeStatus, f.icon, f.label])).toEqual([
      ['fake_location_attempt', 'cancelled', ShieldAlert, 'Fake location'],
      ['leave_pending', 'neutral', Clock, 'Leave pending'],
      ['corrected', 'neutral', Pencil, 'Corrected'],
    ]);
  });

  it('emits in DESIGN.md order and nothing when the day is clean', () => {
    expect(dayFlagVisuals(row())).toEqual([]);
    const both = dayFlagVisuals(
      row({ isLate: true, lateMinutes: 5, markers: ['checkout_missing'] }),
    );
    // The checkout_missing MARKER carries no flag tag of its own (the tag
    // set is Late/Early/Fake/Leave pending/Corrected).
    expect(both.map(f => f.key)).toEqual(['late']);
  });
});
