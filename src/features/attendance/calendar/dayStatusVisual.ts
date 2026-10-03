/**
 * dayStatusVisual.ts — THE single status→visual table for the attendance
 * month views (Story 18-3 D1 / DESIGN.md StatusBadge + Flag tables).
 *
 * Three consumers read this one mapping — MonthCalendar's cell glyphs, the
 * DayDetailSheet's StatusBadge, and (since 19-6) the self view's read-only
 * day sheet — so a table drift breaks a production surface loudly instead
 * of silently mis-rendering. Labels are the DESIGN.md table verbatim; tone
 * is `soft` everywhere in this module (`in_progress` renders on the
 * EXISTING `progress` key — don't invent synonyms). All 16 icons verified
 * present in lucide-react-native 1.48 (the Circle* renames keep their
 * aliases).
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
import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { colors, type StatusKey } from '../../../theme';
import type { DayMarker, DayStatusKey, DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { DAY_STATUS_LABELS } from '../../../services/resources/attendanceDayStatus';

/** One day status's visual identity — exactly what `Badge tone="soft"` renders. */
export interface DayStatusVisual {
  badgeStatus: StatusKey;
  icon: LucideIcon;
  label: string;
}

/** Wire key → { colour family, icon, verbatim label } (DESIGN.md table).
 *  Labels come from the wire vocabulary's single source (DAY_STATUS_LABELS);
 *  this table is still the ONLY place a status's colour family + icon live. */
export const DAY_STATUS_VISUALS: Record<DayStatusKey, DayStatusVisual> = {
  present: { badgeStatus: 'done', icon: CheckCircle2, label: DAY_STATUS_LABELS.present },
  half_day: { badgeStatus: 'scheduled', icon: Clock, label: DAY_STATUS_LABELS.half_day },
  absent: { badgeStatus: 'cancelled', icon: XCircle, label: DAY_STATUS_LABELS.absent },
  leave: { badgeStatus: 'leave', icon: CalendarOff, label: DAY_STATUS_LABELS.leave },
  half_day_leave: {
    badgeStatus: 'halfDayLeave',
    icon: CalendarClock,
    label: DAY_STATUS_LABELS.half_day_leave,
  },
  weekly_off: { badgeStatus: 'weeklyOff', icon: Moon, label: DAY_STATUS_LABELS.weekly_off },
  holiday: { badgeStatus: 'holiday', icon: Flag, label: DAY_STATUS_LABELS.holiday },
  worked_on_holiday: {
    badgeStatus: 'workedHoliday',
    icon: Briefcase,
    label: DAY_STATUS_LABELS.worked_on_holiday,
  },
  checkout_missing: {
    badgeStatus: 'checkoutMissing',
    icon: AlertCircle,
    label: DAY_STATUS_LABELS.checkout_missing,
  },
  not_tracked: {
    badgeStatus: 'notTracked',
    icon: MinusCircle,
    label: DAY_STATUS_LABELS.not_tracked,
  },
  not_checked_in_yet: {
    badgeStatus: 'notCheckedIn',
    icon: Circle,
    label: DAY_STATUS_LABELS.not_checked_in_yet,
  },
  in_progress: { badgeStatus: 'progress', icon: Play, label: DAY_STATUS_LABELS.in_progress },
};

/** The soft chip colours for a status — the same mapping `Badge` uses. */
export function dayStatusColors(key: DayStatusKey) {
  return colors.status[DAY_STATUS_VISUALS[key].badgeStatus];
}

/**
 * The ONE 12px soft-badge icon element: the sheet's StatusBadge, the
 * detail flag row and 18-4's correction-stage flagbadge row (the row is
 * deliberately repeated under the same heading) all render the same
 * picture. `createElement` keeps this table module JSX-free.
 */
export function softBadgeIcon(
  icon: LucideIcon,
  badgeStatus: StatusKey,
): ReactElement {
  return createElement(icon, {
    size: 12,
    color: colors.status[badgeStatus].fg,
    strokeWidth: 2,
  });
}

/** One flag tag under the sheet's StatusBadge (DESIGN.md Flag table). */
export interface DayFlagVisual {
  key: DayMarker | 'late' | 'early';
  badgeStatus: StatusKey;
  icon: LucideIcon;
  label: string;
}

/**
 * The day's flag tags, in DESIGN.md order: Late {n} min / Early {n} min /
 * Fake location / Leave pending / Corrected. Late/early derive from the
 * row's outcome booleans + minutes (the BE emits no flags on off-day
 * statuses); minutes render only when present, in words past the hour
 * ("90" → "1 hr 30 min").
 */
/** Whole minutes → chip words: under an hour "22 min"; at or above,
 *  hours + minutes ("2 hr 0 min"). */
function flagMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hr ${m} min`;
}

export function dayFlagVisuals(day: DayStatusRow): DayFlagVisual[] {
  const flags: DayFlagVisual[] = [];
  if (day.isLate) {
    flags.push({
      key: 'late',
      badgeStatus: 'checkoutMissing',
      icon: AlertCircle,
      label:
        day.lateMinutes != null ? `Late ${flagMinutes(day.lateMinutes)}` : 'Late',
    });
  }
  if (day.earlyCheckout) {
    flags.push({
      key: 'early',
      badgeStatus: 'checkoutMissing',
      icon: AlertCircle,
      label:
        day.earlyCheckoutMinutes != null
          ? `Early ${flagMinutes(day.earlyCheckoutMinutes)}`
          : 'Early',
    });
  }
  if (day.markers.includes('fake_location_attempt')) {
    flags.push({
      key: 'fake_location_attempt',
      badgeStatus: 'cancelled',
      icon: ShieldAlert,
      label: 'Fake location',
    });
  }
  if (day.markers.includes('leave_pending')) {
    flags.push({
      key: 'leave_pending',
      badgeStatus: 'neutral',
      icon: Clock,
      label: 'Leave pending',
    });
  }
  if (day.markers.includes('corrected')) {
    flags.push({
      key: 'corrected',
      badgeStatus: 'neutral',
      icon: Pencil,
      label: 'Corrected',
    });
  }
  return flags;
}
