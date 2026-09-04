import { View, Text, StyleSheet, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import { Bell, Calendar, CalendarClock, CircleAlert, HardHat } from 'lucide-react-native';
import { Card } from './ui';
import { colors, palette, radius, spacing, typography } from '../theme';
import type { JobCounts, JobScope } from '../services';

interface StatCardProps {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  subtitle: string;
  size: number;
  /** Present only on job tiles: deep-links the Jobs tab to this tile's scope. */
  onPress?: () => void;
}

/**
 * A KPI stat tile: icon+label row, then the value — never a forced square.
 * `size` only fixes the *width* (so the row splits evenly); height follows
 * content, and `statsRow`'s default stretch keeps both tiles in a row the
 * same height without either one padding itself out with dead space.
 *
 * Job tiles are pressable (Today/Upcoming/Overdue each jump to the Jobs tab
 * pre-set to their scope) — Technicians has no destination and stays inert.
 */
function StatCard({ icon, bgColor, title, subtitle, size, onPress }: StatCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      // Subtitle first ("Today 3") — the natural announcement order for a
      // labelled value, and it lets tests key tiles by their label.
      accessibilityLabel={`${subtitle} ${title}`}
      onPress={onPress}
      disabled={!onPress}
      // Pressed dim (0.8, same as the app's chip rows) — these are Home's
      // primary tap targets, so a tap must feel responsive.
      style={({ pressed }) => [{ width: size, opacity: pressed ? 0.8 : 1 }]}>
      <Card padding="sm" style={styles.statCard}>
        <View style={styles.statLabelRow}>
          <View style={[styles.statIconChip, { backgroundColor: bgColor }]}>
            {icon}
          </View>
          <Text style={styles.statSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>

        <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
      </Card>
    </Pressable>
  );
}

export interface HomeHeaderProps {
  /**
   * First name of the signed-in owner (already extracted by the caller), from
   * `GET /users/me`. May be empty when the profile has `name: null` (fresh
   * owner account) — the greeting then drops the name entirely.
   */
  ownerName: string;
  /** Company name, from the profile's `tenant.companyName`. */
  businessName: string;
  /** From the profile's `technicianCount`. */
  technicianCount: number;
  /** From the profile's `jobCounts` (the `/users/me` dashboard counts). */
  jobCounts: JobCounts;
  /** Pressing a job tile navigates to the Jobs tab pre-set to that scope. */
  onTilePress: (scope: JobScope) => void;
}

export default function HomeHeader({
  ownerName,
  businessName,
  technicianCount,
  jobCounts,
  onTilePress,
}: HomeHeaderProps) {
  // Card side = (screen width - horizontal gutters - inter-card gap) / 2
  // Recalculated on every render so it stays correct on rotation / split-screen.
  const { width: screenWidth } = useWindowDimensions();
  const cardSize = (screenWidth - spacing.s4 * 2 - spacing.s3) / 2;

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
              <Text style={styles.greetingText}>
                {ownerName ? `Good morning, ${ownerName}` : 'Good morning'}
              </Text>
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

        {/* Stat Grid — two rows of two half-width tiles each. The three job
            tiles are the actionable counts (`jobCounts`) and each deep-links
            the Jobs tab to its scope; Technicians has no destination. */}
        <View style={styles.statsGrid}>
          <Card padding="none" elevated={false} style={styles.statsRow}>
            <StatCard
                icon={<Calendar color={colors.primary} size={16} strokeWidth={1.75} />}
                bgColor={colors.primarySoft}
                title={String(jobCounts.today)}
                subtitle="Today"
                size={cardSize}
                onPress={() => onTilePress('today')}
            />

            <StatCard
                icon={<CalendarClock color={colors.status.scheduled.solid} size={16} strokeWidth={1.75} />}
                bgColor={colors.status.scheduled.bg}
                title={String(jobCounts.upcoming)}
                subtitle="Upcoming"
                size={cardSize}
                onPress={() => onTilePress('upcoming')}
            />
          </Card>
          <Card padding="none" elevated={false} style={styles.statsRow}>
            {/* Overdue uses the neutral palette, matching JobCard's overdue
                badge — the DS forbids a new status colour for overdue
                (Cancelled's red must stay unambiguous). */}
            <StatCard
                icon={<CircleAlert color={colors.status.neutral.solid} size={16} strokeWidth={1.75} />}
                bgColor={colors.status.neutral.bg}
                title={String(jobCounts.overdue)}
                subtitle="Overdue"
                size={cardSize}
                onPress={() => onTilePress('overdue')}
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
  // The Pressable owns the width (passed via `size`) so the split stays even;
  // the Card fills it. Tap area: the card's height clears the 44px DS floor.
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
});
