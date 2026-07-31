/**
 * MoreScreen — Technicians + Notifications tiles, Settings row, account
 * card, and Log out. Logging out resets the auth gate (`useAuth().reset()`),
 * which sends the user back to the account-setup flow.
 */
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Bell, ChevronRight, HardHat, LogOut, Settings } from 'lucide-react-native';
import { Avatar, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../auth';
import { useMyProfile } from '../profile';
import { useTechnicians } from '../technicians';
import { MoreTile } from './components/MoreTile';

/** `role` is a lowercase enum on the wire (`owner` | `technician`) — title-case it for display. */
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function MoreScreen() {
  const { width } = useWindowDimensions();
  const tileSize = (width - spacing.s4 * 2 - spacing.s3) / 2;
  const { reset } = useAuth();
  const { clear: clearTechnicians } = useTechnicians();
  const { profile, isLoading, clear: clearProfile } = useMyProfile();
  const navigation = useNavigation();

  // Server truth (`technicianCount`), not the local invite store. The API has
  // no active/offline split, so the tile shows the count only.
  const technicianCount = profile?.technicianCount ?? 0;
  const techSubtitle =
    technicianCount === 0
      ? 'Add your team'
      : `${technicianCount} ${technicianCount === 1 ? 'technician' : 'technicians'}`;

  const handleLogOut = () => {
    Alert.alert('Log out', 'You will need to verify your number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          clearTechnicians();
          clearProfile();
          reset();
        },
      },
    ]);
  };

  // Account name and company come from `GET /users/me` (shared with Home) —
  // nothing is hardcoded, so hold the screen until the profile is in.
  if (isLoading || !profile) {
    return (
      <SafeAreaView style={styles.loadingRoot} edges={['top']}>
        <ActivityIndicator size="large" color={colors.onPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>{profile.tenant.companyName}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tileRow}>
          <MoreTile
            icon={<HardHat size={22} color={colors.status.progress.solid} strokeWidth={1.5} />}
            iconBg={colors.status.progress.bg}
            title="Technicians"
            subtitle={techSubtitle}
            size={tileSize}
            onPress={() => navigation.navigate('Technicians')}
          />
          {/* No notifications system exists yet — no count to show. */}
          <MoreTile
            icon={<Bell size={22} color={colors.status.done.solid} strokeWidth={1.5} />}
            iconBg={colors.status.done.bg}
            title="Notifications"
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
            <Avatar name={profile.name} size="lg" />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{profile.name}</Text>
              <Text style={styles.rowSubtitle}>{roleLabel(profile.role)}</Text>
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
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
