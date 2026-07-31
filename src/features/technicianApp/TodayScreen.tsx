/**
 * TodayScreen — the technician's "Today" tab. Deliberately minimal for this
 * first cut: a greeting and the day's assigned jobs, nothing else. No
 * earnings card, no jobs-left count, no date strip — those all need
 * backend support (payments, a jobs-left computation, multi-day job data)
 * that doesn't exist yet; adding them now would just be UI over no data.
 *
 * `TODAY_JOBS` is empty until the technician-jobs API exists (see data.ts),
 * so this renders the empty state for every technician today, including
 * first login right after accepting an invite.
 */
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarCheck } from 'lucide-react-native';
import { EmptyState } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../auth';
import { JobCard } from '../jobs/components/JobCard';
import { TODAY_JOBS } from './data';
import type { Job } from '../jobs/types';

export default function TodayScreen() {
  const { session } = useAuth();
  const firstName = session?.name?.split(' ')[0] ?? 'there';
  const hasJobs = TODAY_JOBS.length > 0;

  const handleOpenJob = (_job: Job) => {
    // TODO: navigate to a job detail screen once it exists.
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Good morning, {firstName}</Text>
      </View>

      {hasJobs ? (
        <FlatList
          data={TODAY_JOBS}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <JobCard job={item} onPress={handleOpenJob} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState
          icon={<CalendarCheck size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No job assigned yet"
          description="Your owner hasn't assigned you any jobs for today. Check back soon."
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
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  greeting: {
    ...typography.title,
    fontSize: 24,
    color: colors.textStrong,
  },
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
});
