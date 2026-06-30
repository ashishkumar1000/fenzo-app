/**
 * JobsScreen — full job list with status filter chips and a "+ New Job"
 * action. Mock data via `data.ts` until `@services/jobService` exists.
 */
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { MOCK_JOBS } from './data';
import type { Job, JobFilter } from './types';

export default function JobsScreen() {
  const [filter, setFilter] = useState<JobFilter>('all');

  const jobs = useMemo(
    () => (filter === 'all' ? MOCK_JOBS : MOCK_JOBS.filter(j => j.status === filter)),
    [filter],
  );

  const handleNewJob = () => {
    // TODO(jobService): navigate to a "New job" form once it exists.
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
