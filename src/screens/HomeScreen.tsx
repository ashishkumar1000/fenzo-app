import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import HomeHeader from '../components/HomeHeader';
import { Badge, Button, Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { CURRENT_BUSINESS } from '../constants/business';
import { useTechnicians } from '../features/technicians';
import { GettingStartedCard } from '../features/home/components/GettingStartedCard';
import { JOBS } from '../features/jobs/data';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { hasTechnicians } = useTechnicians();
  const hasJobs = JOBS.length > 0;

  // First-run: surface the setup checklist until the owner has a team and a job.
  const isSetupComplete = hasTechnicians && hasJobs;

  const handleCreateJob = () => {
    // TODO(Phase 2): open the "New job" sheet once it exists.
  };

  if (!isSetupComplete) {
    return (
      <SafeAreaView style={styles.newUserRoot} edges={['top']}>
        <View style={styles.greetingHeader}>
          <Text style={styles.greeting}>
            Good morning, {CURRENT_BUSINESS.ownerName.split(' ')[0]}
          </Text>
          <Text style={styles.business}>{CURRENT_BUSINESS.businessName}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.newUserContent}>
          <GettingStartedCard
            hasTechnicians={hasTechnicians}
            hasJobs={hasJobs}
            onAddTechnician={() => navigation.navigate('Technicians')}
            onCreateJob={handleCreateJob}
          />

          <View style={styles.jobsSection}>
            <Text style={styles.sectionTitle}>Today's jobs</Text>
            <Card padding="lg" style={styles.noJobsCard}>
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
      <HomeHeader />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Today's jobs</Text>

        <Card padding="md" style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>AC not cooling</Text>
            <Badge status="progress" dot>
              In Progress
            </Badge>
          </View>
          <Text style={styles.cardMeta}>Quarterly service · 10:30 AM</Text>
        </Card>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() =>
            navigation.navigate('Details', { itemId: 42, title: 'Hello' })
          }>
          Open details
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
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
  card: {
    gap: spacing.s2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textStrong,
  },
  cardMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
