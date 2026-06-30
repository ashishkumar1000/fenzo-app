/**
 * MoreScreen — Technicians + Notifications tiles, Settings row, account
 * card, and Log out. Logging out resets the auth gate (`useAuth().reset()`),
 * which sends the user back to the account-setup flow.
 */
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, ChevronRight, HardHat, LogOut, Settings } from 'lucide-react-native';
import { Avatar, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { CURRENT_BUSINESS } from '../../constants/business';
import { useAuth } from '../auth';
import { MoreTile } from './components/MoreTile';

export default function MoreScreen() {
  const { width } = useWindowDimensions();
  const tileSize = (width - spacing.s4 * 2 - spacing.s3) / 2;
  const { reset } = useAuth();

  const handleLogOut = () => {
    Alert.alert('Log out', 'You will need to verify your number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: reset },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>{CURRENT_BUSINESS.businessName}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tileRow}>
          <MoreTile
            icon={<HardHat size={22} color={colors.status.progress.solid} strokeWidth={1.5} />}
            iconBg={colors.status.progress.bg}
            title="Technicians"
            subtitle="4 active · 2 offline"
            size={tileSize}
          />
          <MoreTile
            icon={<Bell size={22} color={colors.status.done.solid} strokeWidth={1.5} />}
            iconBg={colors.status.done.bg}
            title="Notifications"
            subtitle="4 new today"
            size={tileSize}
          />
        </View>

        <Card padding="none" interactive style={styles.row}>
          <View style={[styles.rowIconBox, { backgroundColor: colors.surfaceSunken }]}>
            <Settings size={20} color={colors.textBody} strokeWidth={1.75} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Settings</Text>
            <Text style={styles.rowSubtitle}>Business &amp; plan</Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
        </Card>

        <Card padding="none" style={styles.accountCard}>
          <View style={styles.accountRow}>
            <Avatar name={CURRENT_BUSINESS.ownerName} size="lg" />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{CURRENT_BUSINESS.ownerName}</Text>
              <Text style={styles.rowSubtitle}>{CURRENT_BUSINESS.ownerRole}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={handleLogOut}
            style={styles.logoutRow}>
            <LogOut size={18} color={colors.danger} strokeWidth={2} />
            <Text style={styles.logoutText}>Log out</Text>
          </Card>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s6,
  },
  title: {
    ...typography.title,
    color: colors.onPrimary,
    fontSize: 28,
  },
  subtitle: {
    ...typography.body,
    color: colors.onPrimary,
    opacity: 0.8,
    marginTop: spacing.s1,
  },
  content: {
    backgroundColor: colors.surfacePage,
    flexGrow: 1,
    padding: spacing.s4,
    gap: spacing.s4,
    borderTopLeftRadius: 0,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  rowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.heading,
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  accountCard: {
    gap: 0,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: 0,
  },
  logoutText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
});
