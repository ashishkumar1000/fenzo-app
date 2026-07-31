/**
 * JobsScreen — full job list with status filter chips (All / Scheduled /
 * In Progress / Done) and a "+ New job" action that pushes the NewJob route.
 *
 * The filter row is always visible, even with no jobs at all, so the four
 * sections are discoverable from the first launch. Any section with nothing
 * in it gets the full "No jobs yet" empty state rather than a stray line of
 * text — with copy that says what would land in *that* section.
 *
 * Live data via `JOBS` in `data.ts` until `@services/jobService` exists.
 */
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  ClipboardList,
  Plus,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { JOBS } from './data';
import type { Job, JobFilter } from './types';

/**
 * Empty-state icon and copy per section — the icon hints at the section's
 * meaning (a calendar for what's booked, a wrench for work underway) so the
 * four empty pages aren't identical.
 *
 * Keyed by `JobFilter`, which includes `cancelled` even though no chip
 * currently exposes it — the entry is here so adding that chip to
 * `JOB_FILTERS` needs no change on this side.
 */
const EMPTY_BY_FILTER: Record<JobFilter, { icon: LucideIcon; description: string }> = {
  all: {
    icon: ClipboardList,
    description:
      'Create your first job to assign it to a technician and track it through to completion.',
  },
  scheduled: {
    icon: CalendarClock,
    description: 'Jobs booked for a future date and time will show up here.',
  },
  progress: {
    icon: Wrench,
    description:
      'Jobs a technician has started, but not yet finished, will show up here.',
  },
  done: {
    icon: CircleCheck,
    description: 'Jobs a technician has marked complete will show up here.',
  },
  cancelled: {
    icon: CircleX,
    description: 'Jobs called off before completion will show up here.',
  },
};

/**
 * Jobs is a tab screen, but "New job" is a full-screen route on the root
 * stack — hence the composite props rather than plain tab props.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function JobsScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<JobFilter>('all');

  // `JOBS` is a module constant today, so `filter` is the only dependency.
  // ⚠️ When this moves to `jobService`/state, add the job list to the deps —
  // otherwise the filtered list won't recompute when new data arrives.
  const jobs = useMemo(
    () => (filter === 'all' ? JOBS : JOBS.filter(j => j.status === filter)),
    [filter],
  );

  const isEmpty = jobs.length === 0;
  const { icon: EmptyIcon, description: emptyDescription } = EMPTY_BY_FILTER[filter];

  const handleNewJob = () => {
    navigation.navigate('NewJob');
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
          shape="pill"
          onPress={handleNewJob}
          leadingIcon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          New job
        </Button>
      </View>

      <View style={styles.filterWrap}>
        <StatusFilterBar value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={jobs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <JobCard job={item} onPress={handleOpenJob} />}
        // When empty: flexGrow gives EmptyState's `flex: 1` a height to centre
        // itself in, and the list padding drops away since EmptyState brings
        // its own horizontal inset.
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          // No CTA here — the "New job" button in the header is the single
          // entry point, so the centre of the page stays informational.
          <EmptyState
            icon={<EmptyIcon size={36} color={colors.primary} strokeWidth={1.5} />}
            title="No jobs yet"
            description={emptyDescription}
          />
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
  listContentEmpty: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  separator: {
    height: spacing.s3,
  },
});
