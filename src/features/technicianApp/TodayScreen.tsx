/**
 * TodayScreen — the technician's "Today" tab: greeting + their assigned
 * jobs for the day, grouped into IN PROGRESS / SCHEDULED / DONE TODAY
 * sections (empty sections omitted; Done today stays visible when
 * non-empty — honest day count, deliberate product behaviour).
 *
 * Data comes from `useTechnicianJobs` (GET /jobs, server-scoped to the
 * caller) — the same store History reads, so the two tabs can never
 * disagree. Cards are the JobCard technician variant: no footer (the
 * technician is themselves) and no customer name (list rows don't carry
 * one pre-sync — the service-type label is the title line).
 *
 * No earnings card, no jobs-left count, no date strip — those all need
 * backend support (payments, a jobs-left computation, multi-day job data)
 * that doesn't exist yet; adding them now would just be UI over no data.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarCheck } from 'lucide-react-native';
import { Button, EmptyState, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { firstName, useMyProfile } from '../profile';
import { JobCard } from '../jobs/components/JobCard';
import type { ApiJob } from '../jobs/types';
import { buildTodaySections } from './todaySections';
import { loadToday, useTechnicianJobs } from './useTechnicianJobs';
import type { TechnicianRootStackParamList } from '../../navigation/types';

export default function TodayScreen() {
  const { profile } = useMyProfile();
  const { today, isLoadingToday, errorToday, hasLoadedToday, refreshToday } =
    useTechnicianJobs();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>();

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next attempt).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [errorToday]);

  // Refetch on every focus — the store throttles (skips within 15s of a
  // success), so tab-hopping and returning from a completed job stay cheap.
  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshToday();
    setIsRefreshing(false);
  }, [refreshToday]);

  const handleOpenJob = useCallback(
    (job: ApiJob) => {
      navigation.navigate('TechJobDetail', { jobId: job.id });
    },
    [navigation],
  );

  const sections = buildTodaySections(today);
  // `name` is nullable on the wire (see `MyProfile`); the greeting falls back
  // to a nameless form when it's missing.
  const name = firstName(profile?.name ?? null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{name ? `Good morning, ${name}` : 'Good morning'}</Text>
      </View>

      {isLoadingToday && !hasLoadedToday ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : errorToday && !hasLoadedToday ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={errorToday} />
          <Button variant="secondary" size="md" onPress={() => void refreshToday()}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* A failed refresh with rows already on screen: keep the rows,
              explain why they may be stale. */}
          {errorToday && hasLoadedToday && !errorDismissed ? (
            <View style={styles.bannerWrap}>
              <InlineError message={errorToday} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <JobCard job={item} showFooter={false} onPress={handleOpenJob} />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarCheck size={36} color={colors.primary} strokeWidth={1.5} />}
              title="No job assigned yet"
              description="Your owner hasn't assigned you any jobs for today. Check back soon."
            />
          }
        />
        </>
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
  // The eyebrow section header: the ONE allowed caps use — tiny letter-spaced
  // caption, muted (ui-design-spec §7). Semibold comes from the `captionStrong`
  // role, not a fontWeight patch (weight must ride the font family).
  sectionHeader: {
    ...typography.captionStrong,
    letterSpacing: 0.72,
    color: colors.textMuted,
    paddingVertical: spacing.s2,
  },
  listContent: {
    padding: spacing.s4,
    paddingTop: 0,
  },
  listContentEmpty: {
    flexGrow: 1,
    // When empty: flexGrow gives EmptyState's `flex: 1` a height to centre
    // itself in, and the list padding drops away since EmptyState brings its
    // own horizontal inset.
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
});