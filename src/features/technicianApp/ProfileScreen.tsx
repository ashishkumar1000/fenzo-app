/**
 * ProfileScreen — the technician's "Profile" tab. First cut is deliberately
 * just identity + Log out: no Jobs done / Rating stat cards (no backend to
 * compute them yet) and no Notifications row (no notifications system
 * exists anywhere in the app yet either). Add those back once the profile
 * API exists — the API contract for it isn't available yet.
 *
 * Name and phone come from `GET /users/me` via `useMyProfile`, not from the
 * auth session — the session holds gating fields only.
 *
 * The name carries the same "Edit name" pencil affordance as the owner's
 * More tab account card (story 5.2): both open the shared `EditNameSheet`,
 * whose successful save updates this screen instantly via the shared
 * profile store.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Pencil, Phone } from 'lucide-react-native';
import { Avatar, Card, IconButton } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { useAuth } from '../auth';
import { EditNameSheet, formatPhone, useMyProfile } from '../profile';

export default function ProfileScreen() {
  const { reset } = useAuth();
  const { profile, isLoading } = useMyProfile();
  const [editNameOpen, setEditNameOpen] = useState(false);

  const handleLogOut = () => {
    Alert.alert('Log out', 'You will need to verify your number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          // Same reset flow as a forced 401 logout (story 5.3): the registry
          // owns the store list (technician jobs included), and the token
          // must go too — a manual logout used to leave the JWT attached.
          clearAuthToken();
          runAllResets();
          reset();
        },
      },
    ]);
  };

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={styles.loadingRoot} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const name = profile.name;
  const phone = formatPhone(profile);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Avatar name={name ?? undefined} size="xl" />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <IconButton
            label="Edit name"
            size="md"
            onPress={() => setEditNameOpen(true)}>
            <Pencil size={18} color={colors.textMuted} strokeWidth={2} />
          </IconButton>
        </View>
        <Text style={styles.role}>Technician</Text>
      </View>

      <EditNameSheet
        visible={editNameOpen}
        currentName={profile.name}
        onClose={() => setEditNameOpen(false)}
      />

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
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
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
