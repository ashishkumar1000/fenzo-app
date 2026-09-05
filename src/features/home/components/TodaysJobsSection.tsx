/**
 * TodaysJobsSection — Home's dispatch view: today's scheduled/in-progress
 * jobs plus an OverdueStrip pointer, or the empty state when neither has
 * anything to show. Pure renderer — the profile fetch/refresh lifecycle
 * stays in HomeScreen/useMyProfile; this component never fetches.
 *
 * Card footers resolve from the BE embed (fenzit-be Story 3-9): `technician`
 * and `customer` are always present objects, but their `name` can be `null`
 * on a data anomaly (mid-page deletion) — the roster lookup is that
 * fallback, never the primary source.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { JobCard } from '../../jobs/components/JobCard';
import { serviceTypeLabel } from '../../jobs/format';
import type { ProfileJob, ProfileTechnician } from '../../../services';
import { selectTodayJobs } from '../selectTodayJobs';
import { OverdueStrip } from './OverdueStrip';

export type TodaysJobsSectionProps = {
  jobs: ProfileJob[];
  overdueCount: number;
  technicianCount: number;
  /** Roster fallback for `job.technician.name` on a data-anomaly row. */
  technicians: ProfileTechnician[];
  onPressJob: (jobId: string) => void;
  onPressStrip: () => void;
  onPressCreate: () => void;
};

export function TodaysJobsSection({
  jobs,
  overdueCount,
  technicianCount,
  technicians,
  onPressJob,
  onPressStrip,
  onPressCreate,
}: TodaysJobsSectionProps) {
  const todayJobs = selectTodayJobs(jobs);
  const technicianNames = new Map(technicians.map(t => [t.id, t.name]));
  const isEmpty = todayJobs.length === 0 && overdueCount === 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Today & needs attention</Text>

      {overdueCount > 0 ? <OverdueStrip count={overdueCount} onPress={onPressStrip} /> : null}

      {todayJobs.map(job => (
        <JobCard
          key={job.id}
          job={job}
          // `||`, not `??`: an anomaly row's embed name can be `''` as well as
          // `null` (fenzit-be Story 3-9 review notes) — either must fall
          // through to the next source, not render blank.
          customerName={job.customer.name || serviceTypeLabel(job.serviceType)}
          technicianName={job.technician.name || technicianNames.get(job.technicianId) || undefined}
          onPress={() => onPressJob(job.id)}
        />
      ))}

      {isEmpty ? (
        <Card padding="lg" style={styles.emptyCard}>
          <View style={styles.emptyIconBadge}>
            <Calendar size={24} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>Nothing scheduled today</Text>
          <Text style={styles.emptyBody}>
            You're all clear. Overdue or upcoming work shows in the tiles above.
          </Text>
          {technicianCount > 0 ? (
            <Button variant="secondary" size="md" onPress={onPressCreate} style={styles.emptyCta}>
              Create a job
            </Button>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s3,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textStrong,
    fontSize: 20,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  emptyIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s1,
  },
  emptyTitle: {
    ...typography.heading,
    fontSize: 16,
    color: colors.textStrong,
  },
  emptyBody: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.s2,
  },
});
