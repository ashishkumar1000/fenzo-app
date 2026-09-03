import { View, Text, StyleSheet, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import { Bell, Calendar, HardHat } from 'lucide-react-native';
import { Card } from './ui';
import { colors, palette, radius, spacing, typography } from '../theme';
import type { JobStatusCounts } from '../services';

interface StatCardProps {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  subtitle: string;
  details?: string;
  size: number;
}

/**
 * The Jobs tile's details string ("0 done · 0 active · 3 sched.") is longer
 * than a half-width tile fits at full size — shrink rather than truncate
 * mid-word, the same technique QuickActions uses for its tile labels.
 */
const STAT_DETAILS_MIN_FONT_SCALE = 0.7;

/**
 * A KPI stat tile: icon+label row, then the value, then an optional detail
 * line — never a forced square. `size` only fixes the *width* (so the row
 * splits evenly); height follows content, and `statsRow`'s default stretch
 * keeps both tiles in a row the same height without either one padding
 * itself out with dead space.
 */
function StatCard({ icon, bgColor, title, subtitle, details, size }: StatCardProps) {
  return (
    <Card padding="sm" style={[styles.statCard, { width: size }]}>
      <View style={styles.statLabelRow}>
        <View style={[styles.statIconChip, { backgroundColor: bgColor }]}>
          {icon}
        </View>
        <Text style={styles.statSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>

      <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>

      {details && (
        <Text
          style={styles.statDetails}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={STAT_DETAILS_MIN_FONT_SCALE}>
          {details}
        </Text>
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

  // Deliberately labeled "Jobs", not "Jobs today": `jobStatusCounts` is a
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

        {/* Stat Grid — each row is a cardholder for its two compact stat tiles */}
        <View style={styles.statsGrid}>
          <Card padding="none" elevated={false} style={styles.statsRow}>
            <StatCard
                icon={<Calendar color={colors.status.progress.solid} size={16} strokeWidth={1.75} />}
                bgColor={colors.status.progress.bg}
                title={String(totalJobs)}
                subtitle="Jobs"
                details={`${jobCounts.completed} done · ${jobCounts.inProgress} active · ${jobCounts.scheduled} sched.`}
                size={cardSize}
            />

            {/* No active/offline split: the API returns a count only, so the
                tile shows the count only. */}
            <StatCard
                icon={<HardHat color={colors.status.neutral.solid} size={16} strokeWidth={1.75} />}
                bgColor={colors.status.neutral.bg}
                title={String(technicianCount)}
                subtitle="Technicians"
                size={cardSize}
            />
          </Card>
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
    marginBottom: spacing.s4,
    paddingHorizontal: spacing.s4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    // The cardholder for the row is invisible: no surface, no border.
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  statCard: {
    gap: spacing.s1,
    overflow: 'hidden',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  statIconChip: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
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
    ...typography.label,
    color: colors.textMuted,
  },
  statDetails: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
});
