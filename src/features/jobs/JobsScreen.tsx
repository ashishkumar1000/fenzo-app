/**
 * JobsScreen — full job list with status filter chips and a "+ New Job"
 * action. When the owner has no jobs yet, the filter row is hidden and a
 * first-run empty state is shown instead. Live data via `JOBS` in `data.ts`
 * until `@services/jobService` exists.
 */
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Briefcase, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, EmptyState } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { JOBS } from './data';
import type { Job, JobFilter } from './types';

export default function JobsScreen() {
  const [filter, setFilter] = useState<JobFilter>('all');

  const hasJobs = JOBS.length > 0;

  const jobs = useMemo(
    () => (filter === 'all' ? JOBS : JOBS.filter(j => j.status === filter)),
    [filter],
  );

  const handleNewJob = () => {
    // TODO(jobService): open the "New job" sheet once it exists (Phase 2).
  };

  const handleOpenJob = (_job: Job) => {
    // TODO: navigate to a job detail screen once it exists.
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Button
          variant="primary"
          size="md"
          onPress={handleNewJob}
          leadingIcon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          New Job
        </Button>
      </View>

      {hasJobs ? (
        <>
          <View style={styles.filterWrap}>
            <StatusFilterBar value={filter} onChange={setFilter} />
          </View>

          <FlatList
            data={jobs}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <JobCard job={item} onPress={handleOpenJob} />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No jobs in this filter yet.</Text>
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        <EmptyState
          icon={<Briefcase size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No jobs yet"
          description="Create your first job to assign it to a technician and track it through to completion."
          ctaLabel="Create first job"
          ctaIcon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.5} />}
          onPressCta={handleNewJob}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  filterWrap: {
    paddingLeft: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s10,
  },
});
