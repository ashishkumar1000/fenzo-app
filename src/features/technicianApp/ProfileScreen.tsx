/**
 * ProfileScreen — the technician's "Profile" tab. First cut is deliberately
 * just identity + Log out: no Jobs done / Rating stat cards (no backend to
 * compute them yet) and no Notifications row (no notifications system
 * exists anywhere in the app yet either). Add those back once the profile
 * API exists — the API contract for it isn't available yet.
 */
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Phone } from 'lucide-react-native';
import { Avatar, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../auth';

export default function ProfileScreen() {
  const { session, reset } = useAuth();
  const name = session?.name ?? 'Technician';
  const phone = session?.phone ?? '';

  const handleLogOut = () => {
    Alert.alert('Log out', 'You will need to verify your number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: reset },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Avatar name={name} size="xl" />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>Technician</Text>
      </View>

      <View style={styles.content}>
        <Card padding="none" style={styles.card}>
          {phone ? (
            <>
              <View style={styles.row}>
                <Phone size={18} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.rowText}>{phone}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.s6,
    paddingBottom: spacing.s5,
    gap: spacing.s2,
  },
  name: {
    ...typography.title,
    fontSize: 20,
    color: colors.textStrong,
  },
  role: {
    ...typography.body,
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: spacing.s4,
  },
  card: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  rowText: {
    ...typography.body,
    color: colors.textStrong,
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
