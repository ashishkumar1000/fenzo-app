import { View, Text, StyleSheet, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Calendar, IndianRupee, Clock, Briefcase, Plus, ClipboardList, DollarSign } from 'lucide-react-native';
import { Card, Button } from './ui';
import { colors, palette, spacing, typography } from '../theme';
import { CURRENT_BUSINESS } from '../constants/business';

interface StatCardProps {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  subtitle: string;
  details?: string;
  trend?: {
    label: string;
    value: string;
    positive: boolean;
  };
  size: number;
}

function StatCard({ icon, bgColor, title, subtitle, details, trend, size }: StatCardProps) {
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

      {trend && (
        <View style={styles.trendContainer}>
          <Text
            style={[styles.trendText, { color: trend.positive ? colors.success : colors.textMuted }]}
            numberOfLines={1}
          >
            {trend.positive ? '↑' : '↓'} {trend.value} {trend.label}
          </Text>
        </View>
      )}
    </Card>
  );
}

export default function HomeHeader() {
  // Card side = (screen width - horizontal gutters - inter-card gap) / 2
  // Recalculated on every render so it stays correct on rotation / split-screen.
  const { width: screenWidth } = useWindowDimensions();
  const cardSize = (screenWidth - spacing.s4 * 2 - spacing.s3) / 2;

  return (
    <>
      {/* iOS blue status bar */}
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Blue Gradient Header */}
        <View style={styles.headerGradient}>
          {/* Header Top - Greeting + Notification */}
          <View style={styles.headerContent}>
            <View style={styles.greetingSection}>
              <Text style={styles.greetingText}>Good morning, {CURRENT_BUSINESS.ownerName.split(' ')[0]}</Text>
              <Text style={styles.serviceText}>{CURRENT_BUSINESS.businessName}</Text>
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
                title="12"
                subtitle="Jobs today"
                details="3 done · 5 active · 4 sched."
                size={cardSize}
            />

            <StatCard
                icon={<Briefcase color={colors.status.neutral.solid} size={24} strokeWidth={1.5} />}
                bgColor={colors.status.neutral.bg}
                title="4 of 6"
                subtitle="Active techs"
                details="2 offline today"
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
              <Text style={styles.newJobButtonText}>New Job</Text>
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
              <Text style={styles.actionButtonText}>All Jobs</Text>
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
  trendContainer: {
    marginTop: spacing.s1,
  },
  trendText: {
    ...typography.bodySm,
    fontWeight: '500',
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
  newJobButton: {
    flex: 1,
    borderRadius: 16,
  },
  newJobButtonText: {
    ...typography.bodySm,
    color: colors.surfaceCard,
    fontWeight: '600',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
  },
  actionButtonText: {
    ...typography.bodySm,
    color: colors.textStrong,
    fontWeight: '500',
  },
});
