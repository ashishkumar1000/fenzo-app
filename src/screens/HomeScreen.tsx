import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, CloudOff, RefreshCw } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import HomeHeader from '../components/HomeHeader';
import { Card, EmptyState, InlineError } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';
import { loadMyProfile, useMyProfile } from '../features/profile';
import { QuickActions } from '../features/home';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  // Everything on this screen comes from `GET /users/me` — name, company,
  // technician count and job counts — shared with More via the same store, so
  // switching tabs doesn't refetch. Nothing is hardcoded, which is why a
  // failed load gets its own error branch rather than a placeholder.
  const { profile, isLoading, error, refresh, dismissError } = useMyProfile();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Every tab focus asks for fresh counts so the tiles are never a snapshot
  // from login. The store's 15s throttle makes rapid tab switching cheap:
  // at most one request per window, and a focus within the window is a no-op.
  // No background spinner — a refresh over existing tiles must not flicker.
  useFocusEffect(
    useCallback(() => {
      void loadMyProfile();
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const handleNewJob = useCallback(() => {
    navigation.navigate('NewJob');
  }, [navigation]);

  const quickActions = (
    <QuickActions
      onNewJob={handleNewJob}
      onAllJobs={() => navigation.navigate('Jobs')}
      onCustomers={() => navigation.navigate('Customers')}
    />
  );

  /**
   * Shown when a *refresh* failed but we still have a profile to render — the
   * screen stays usable, the banner explains why it may be stale. A failure
   * with no profile at all takes the full-screen error branch below instead.
   */
  const errorBanner =
    error && profile ? (
      <InlineError message={error} onDismiss={dismissError} />
    ) : null;

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  // --- Loading: first load, before any profile copy exists ------------------
  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredRoot} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // --- Error: no profile means no name, no company — nothing to show --------
  if (!profile) {
    return (
      <SafeAreaView style={styles.centeredRoot} edges={['top']}>
        <EmptyState
          icon={<CloudOff size={36} color={colors.danger} strokeWidth={1.5} />}
          title="Couldn't load your account"
          description={error ?? 'Something went wrong. Please try again.'}
          ctaLabel="Try again"
          ctaIcon={<RefreshCw size={18} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={refresh}
        />
      </SafeAreaView>
    );
  }

  const ownerFirstName = profile.name.split(' ')[0];
  const businessName = profile.tenant.companyName;
  const { jobCounts, technicianCount } = profile;
  // The five buckets are mutually exclusive (three IST day-buckets + two
  // all-time finished totals), so their sum is every job in the account.
  const totalJobs =
    jobCounts.today +
    jobCounts.upcoming +
    jobCounts.overdue +
    jobCounts.completed +
    jobCounts.cancelled;
  const hasTechnicians = technicianCount > 0;

  // First-run: simplified Home until the account has a team and a job. Both
  // facts come from the server, so an account set up on another device shows
  // the right Home here too.
  const isSetupComplete = hasTechnicians && totalJobs > 0;

  if (!isSetupComplete) {
    return (
      <SafeAreaView style={styles.newUserRoot} edges={['top']}>
        <View style={styles.greetingHeader}>
          <Text style={styles.greeting}>Good morning, {ownerFirstName}</Text>
          <Text style={styles.business}>{businessName}</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.newUserContent}
          refreshControl={refreshControl}>
          {errorBanner}
          {quickActions}

          <View style={styles.jobsSection}>
            <Text style={styles.sectionTitle}>Today's jobs</Text>
            <Card padding="lg" style={styles.noJobsCard}>
              <View style={styles.noJobsIconBadge}>
                <Calendar size={24} color={colors.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.noJobsTitle}>No jobs yet</Text>
              <Text style={styles.noJobsBody}>
                {hasTechnicians
                  ? 'Create your first job to assign it to a technician.'
                  : 'Add a technician first, then you can create and assign jobs.'}
              </Text>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Established account: full dashboard.
  return (
    <>
      <HomeHeader
        ownerName={profile.name}
        businessName={businessName}
        technicianCount={technicianCount}
        jobCounts={jobCounts}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}>
        {errorBanner}
        {quickActions}

        <View style={styles.jobsSection}>
          <Text style={styles.sectionTitle}>Today's jobs</Text>
          {/* The profile payload returns a `jobs` page, but its item shape
              isn't modelled yet — so no list here rather than invented rows.
              Wire this to `profile.jobs.data` once the job shape is known. */}
          <Card padding="lg" style={styles.noJobsCard}>
            <View style={styles.noJobsIconBadge}>
              <Calendar size={24} color={colors.primary} strokeWidth={1.5} />
            </View>
            <Text style={styles.noJobsTitle}>Nothing scheduled today</Text>
          </Card>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  // --- Loading / error views ---
  centeredRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- New-user view ---
  newUserRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  greetingHeader: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s4,
  },
  greeting: {
    ...typography.title,
    fontSize: 26,
    color: colors.textStrong,
  },
  business: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  newUserContent: {
    padding: spacing.s4,
    paddingTop: spacing.s1,
    gap: spacing.s5,
  },
  jobsSection: {
    gap: spacing.s3,
  },
  noJobsCard: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  noJobsIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s1,
  },
  noJobsTitle: {
    ...typography.heading,
    fontSize: 16,
    color: colors.textStrong,
  },
  noJobsBody: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // --- Established dashboard ---
  screen: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textStrong,
    fontSize: 20,
  },
});
