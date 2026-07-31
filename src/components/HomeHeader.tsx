import { View, Text, StyleSheet, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import { Bell, Calendar, HardHat, Plus, ClipboardList, DollarSign } from 'lucide-react-native';
import { Card, Button } from './ui';
import { colors, palette, spacing, typography } from '../theme';
import type { JobStatusCounts } from '../services';

interface StatCardProps {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  subtitle: string;
  details?: string;
  size: number;
}

function StatCard({ icon, bgColor, title, subtitle, details, size }: StatCardProps) {
  return (
    <Card padding="sm" style={[styles.statCard, { width: size, height: size }]}>
      <View style={styles.statIconContainer}>
        <View style={[styles.statIconBox, { backgroundColor: bgColor }]}>
          {icon}
        </View>
      </View>

      <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.statSubtitle} numberOfLines={1}>{subtitle}</Text>

      {details && (
        <Text style={styles.statDetails} numberOfLines={1}>{details}</Text>
      )}
    </Card>
  );
}

export interface HomeHeaderProps {
  /** Full name of the signed-in owner, from `GET /users/me`. Only the first word is shown. */
  ownerName: string;
  /** Company name, from the profile's `tenant.companyName`. */
  businessName: string;
  /** From the profile's `technicianCount`. */
  technicianCount: number;
  /** From the profile's `jobStatusCounts`. */
  jobCounts: JobStatusCounts;
}

export default function HomeHeader({
  ownerName,
  businessName,
  technicianCount,
  jobCounts,
}: HomeHeaderProps) {
  // Card side = (screen width - horizontal gutters - inter-card gap) / 2
  // Recalculated on every render so it stays correct on rotation / split-screen.
  const { width: screenWidth } = useWindowDimensions();
  const cardSize = (screenWidth - spacing.s4 * 2 - spacing.s3) / 2;

  // Deliberately labelled "Jobs", not "Jobs today": `jobStatusCounts` is a
  // total across the account, and the API has no today-scoped counts yet.
  const totalJobs =
    jobCounts.scheduled +
    jobCounts.inProgress +
    jobCounts.completed +
    jobCounts.cancelled;

  return (
    <>
      {/* iOS blue status bar */}
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Plain View, not SafeAreaView: the blue header handles the notch with
          its own top margin (see headerContent.marginTop). It previously kept
          an `edges` prop left over from a SafeAreaView — a no-op at runtime,
          and a type error. */}
      <View style={styles.safeArea}>
        {/* Blue Gradient Header */}
        <View style={styles.headerGradient}>
          {/* Header Top - Greeting + Notification */}
          <View style={styles.headerContent}>
            <View style={styles.greetingSection}>
              <Text style={styles.greetingText}>Good morning, {ownerName.split(' ')[0]}</Text>
              <Text style={styles.serviceText}>{businessName}</Text>
            </View>

            <Pressable style={styles.notificationButton} onPress={() => {}}>
              <View style={styles.notificationBadge}>
                <Bell color={colors.surfaceCard} size={24} strokeWidth={1.5} />
                <View style={styles.notificationDot} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Stats Grid — each row is a Card holder for its two square stat tiles */}
        <View style={styles.statsGrid}>
          <Card padding="none" elevated={false} style={styles.statsRow}>
            <StatCard
                icon={<Calendar color={colors.status.progress.solid} size={24} strokeWidth={1.5} />}
                bgColor={colors.status.progress.bg}
                title={String(totalJobs)}
                subtitle="Jobs"
                details={`${jobCounts.completed} done · ${jobCounts.inProgress} active · ${jobCounts.scheduled} sched.`}
                size={cardSize}
            />

            {/* No active/offline split: the API returns a count only, so the
                tile shows the count only. */}
            <StatCard
                icon={<HardHat color={colors.status.neutral.solid} size={24} strokeWidth={1.5} />}
                bgColor={colors.status.neutral.bg}
                title={String(technicianCount)}
                subtitle="Technicians"
                size={cardSize}
            />
          </Card>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <Button
            variant="primary"
            size="lg"
            fullWidth={false}
            style={styles.newJobButton}
            onPress={() => {}}
          >
            <View style={styles.buttonContent}>
              <Plus color={colors.surfaceCard} size={20} strokeWidth={2.5} />
              <Text style={styles.newJobButtonText}>New job</Text>
            </View>
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth={false}
            style={styles.actionButton}
            onPress={() => {}}
          >
            <View style={styles.buttonContent}>
              <ClipboardList color={colors.textStrong} size={20} strokeWidth={1.5} />
              <Text style={styles.actionButtonText}>All jobs</Text>
            </View>
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth={false}
            style={styles.actionButton}
            onPress={() => {}}
          >
            <View style={styles.buttonContent}>
              <DollarSign color={colors.textStrong} size={20} strokeWidth={1.5} />
              <Text style={styles.actionButtonText}>Invoices</Text>
            </View>
          </Button>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surfacePage,
  },
  headerGradient: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    paddingBottom: spacing.s6,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s16,
    marginTop: spacing.s10,
  },
  greetingSection: {
    flex: 1,
  },
  greetingText: {
    ...typography.title,
    color: colors.surfaceCard,
    fontSize: 28,
    fontWeight: '600',
    marginBottom: spacing.s1,
  },
  serviceText: {
    ...typography.body,
    color: palette.blue200,
  },
  notificationButton: {
    padding: spacing.s2,
  },
  notificationBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.red500,
  },
  statsGrid: {
    gap: spacing.s4,
    marginTop: -spacing.s16,
    paddingHorizontal: spacing.s4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    // The Card holder for the row is invisible: no surface, no border.
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  statCard: {
    gap: spacing.s2,
    overflow: 'hidden',
  },
  statIconContainer: {
    // No marginBottom — keep the icon tight to the title so the stack fits the square.
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statTitle: {
    ...typography.heading,
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '700',
  },
  statSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  statDetails: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
  },
  buttonContent: {
    flexDirection: 'row',
    gap: spacing.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `style` on a Button lands on its outer wrapper, so only layout props take
  // effect here — a borderRadius set this way would be silently ignored. Use
  // the Button's own `shape` prop for corners.
  newJobButton: {
    flex: 1,
  },
  newJobButtonText: {
    ...typography.labelStrong,
    color: colors.surfaceCard,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonText: {
    ...typography.label,
    color: colors.textStrong,
  },
});
