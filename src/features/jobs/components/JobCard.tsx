/**
 * JobCard — one row in the Jobs list. Composes Card + Badge + Avatar.
 *
 * Renders `ApiJob` directly: names are passed in as props (list rows carry
 * only ids — the screen resolves them from the customers store and roster),
 * and every other piece comes from the formatter layer in `format.ts`.
 * Header: title + status badge (with an Urgent marker when applicable) ·
 * meta rows: skill + time · footer: the assigned technician. No amount —
 * jobs don't carry one.
 *
 * Pass `urgencyNow` (a ticked wall-clock ms) to draw the urgency rail — a
 * 3px left edge, green/amber/red by time-to-start. Every job list that
 * passes a clock gets one (Today, Upcoming, Overdue — all scopes; see
 * `urgency.ts` for the mapping and thresholds). Deliberately colour-only:
 * the scheduled-time text on the card already carries the same information,
 * so screen readers lose nothing — a non-colour cue would need its own
 * design decision.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { StatusKey } from '../../../theme';
import { daysOverdue, formatIstDateLabel } from '../../../utils';
import type { ApiJob, JobScope } from '../types';
import { formatTimeLabel, statusToBadge } from '../format';
import { jobUrgency } from '../urgency';
import type { JobUrgency } from '../urgency';

type Props = {
  job: ApiJob;
  /**
   * Which timeline scope the row is rendered in — drives the scheduled-time
   * meta row. Defaults to `today` (time-only rendering): the owner screens
   * must render byte-identical to before Story 1.5, and the technician's
   * `TodayScreen` passes nothing too; `HistoryScreen` passes `history`.
   *   upcoming — prefixed with the scheduled IST date (times alone aren't
   *              enough when rows span days).
   *   overdue  — time label plus a neutral "N days overdue" badge (attention,
   *              NOT a status-colour badge competing with the fixed vocabulary).
   *   history  — completion date/time from `completedAt`, or "Cancelled".
   */
  scope?: JobScope;
  /**
   * The ticked wall-clock (ms) that drives the urgency rail — the caller
   * (a job-list screen) owns the tick, so one timer serves the whole
   * list instead of one per card. Omit (undefined) for no rail: urgency is
   * opt-in per surface, and only active jobs (not done/cancelled) get one.
   */
  urgencyNow?: number;
  /** Resolved customer display name; falls back to the skill name if absent. */
  customerName?: string;
  /** Resolved technician display name; falls back to a neutral placeholder. */
  technicianName?: string;
  /**
   * Owner lists render the footer (Avatar + technician name). The technician
   * side omits it — the technician is themselves — via `showFooter={false}`
   * (ui-design-spec §1, Story 3.1).
   */
  showFooter?: boolean;
  onPress?: (job: ApiJob) => void;
};

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL: Record<Exclude<StatusKey, 'neutral'>, string> = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
};

/**
 * Rail colours by urgency level — borrowed status palettes (DESIGN_SYSTEM.md).
 * A total map, not a fall-through ternary: `null` urgency never reaches this
 * (the style below guards on `urgency`), and no level can silently read as
 * another colour.
 */
const URGENCY_BORDER: Record<Exclude<JobUrgency, null>, string> = {
  calm: colors.status.done.solid,
  near: colors.status.scheduled.solid,
  now: colors.status.cancelled.solid,
};

export function JobCard({
  job,
  scope = 'today',
  urgencyNow,
  customerName,
  technicianName,
  showFooter = true,
  onPress,
}: Props) {
  const badgeStatus = statusToBadge(job.status);
  const skillLabel = job.skill?.name || 'Service';

  // Urgency rail — the caller passes the ticked clock, and every list that
  // does gets the rail on its active rows. An in-progress row keeps the same
  // time-to-start mapping: before its slot it's on track, past its slot the
  // red rail reads "running behind" (work still needs doing until it
  // completes). Status palettes borrowed per DESIGN_SYSTEM.md: green "on
  // track", amber "coming up" (the hue Scheduled already wears), red "act
  // now" (the same borrow the Urgent badge makes). Inactive jobs get no rail
  // at all.
  const urgency: JobUrgency =
    urgencyNow === undefined ? null : jobUrgency(job, urgencyNow);

  // The scheduled-time meta row, per scope. Today keeps the original
  // time-only rendering byte-for-byte. In history, a completed row with a
  // null completedAt falls back to the scheduled slot — unreachable via the
  // current BE payloads (completion stamps completedAt), kept so the row
  // still shows a sensible time if the stamp is ever absent.
  const timeText =
    scope === 'upcoming'
      ? `${formatIstDateLabel(job.scheduledStart)} · ${formatTimeLabel(job.scheduledStart, job.scheduledEnd)}`
      : scope === 'history' && job.status === 'cancelled'
        ? 'Cancelled'
        : scope === 'history' && job.completedAt
          ? `${formatIstDateLabel(job.completedAt)} · ${formatTimeLabel(job.completedAt, null)}`
          : formatTimeLabel(job.scheduledStart, job.scheduledEnd);
  // Only computed in the overdue scope (IST day-diff vs today).
  const overdueDays = scope === 'overdue' ? daysOverdue(job.scheduledStart) : 0;

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(job) : undefined}
      style={[
        styles.card,
        // The urgency rail: a 3px left edge over the card's 1px hairline —
        // the other three sides keep borderSubtle. The guard narrows
        // `urgency` non-null, so the map lookup is total.
        urgency ? { borderLeftWidth: 3, borderLeftColor: URGENCY_BORDER[urgency] } : null,
      ]}>
      <View style={styles.headerRow}>
        <Text style={styles.customerName} numberOfLines={1}>
          {customerName ?? skillLabel}
        </Text>
        <View style={styles.badgeRow}>
          {job.priority === 'urgent' ? (
            // Urgent borrows the cancelled palette — red communicates urgency
            // without inventing a new status colour.
            <Badge status="cancelled" tone="soft" size="sm">
              Urgent
            </Badge>
          ) : null}
          <Badge status={badgeStatus} dot>
            {STATUS_LABEL[badgeStatus]}
          </Badge>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText} numberOfLines={1}>
          {job.description ?? skillLabel}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Clock size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText}>{timeText}</Text>
        {scope === 'overdue' ? (
          // Neutral badge on purpose: overdue is an attention marker, not one
          // of the four job statuses — a new colour would break the fixed
          // status vocabulary (DESIGN_SYSTEM.md).
          <Badge status="neutral" tone="soft" size="sm">
            {`${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue`}
          </Badge>
        ) : null}
      </View>

      {showFooter ? (
        <>
          <View style={styles.divider} />

          <View style={styles.footerRow}>
            <View style={styles.techRow}>
              <Avatar name={technicianName ?? 'Technician'} size="sm" />
              <Text style={styles.techName} numberOfLines={1}>
                {technicianName ?? 'Technician'}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  customerName: {
    ...typography.heading,
    color: colors.textStrong,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s1,
  },
  // Left-aligned now that the amount is gone — the row keeps the Avatar +
  // name pattern for when the technician side omits it (Story 3.1).
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flex: 1,
  },
  techName: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});