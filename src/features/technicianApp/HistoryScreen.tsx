/**
 * HistoryScreen — the technician's "History" tab: their past jobs, most
 * recent first. No All / This week / This month filters for this first
 * cut — nothing to filter until there's real history, and they're easy to
 * add back once the history API exists and there's data to filter.
 *
 * `JOB_HISTORY` is empty until that API exists (see data.ts), so this shows
 * the empty state for every technician today.
 */
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { History as HistoryIcon } from 'lucide-react-native';
import { EmptyState } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { JobCard } from '../jobs/components/JobCard';
import { JOB_HISTORY } from './data';
import type { Job } from '../jobs/types';

export default function HistoryScreen() {
  const hasHistory = JOB_HISTORY.length > 0;

  const handleOpenJob = (_job: Job) => {
    // TODO: navigate to a job detail screen once it exists.
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      {hasHistory ? (
        <FlatList
          data={JOB_HISTORY}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <JobCard job={item} onPress={handleOpenJob} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState
          icon={<HistoryIcon size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No job history yet"
          description="Jobs you've completed will show up here."
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
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
});
