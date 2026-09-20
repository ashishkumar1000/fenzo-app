/**
 * MoreScreen — the account/settings tab. Header is a plain "Account &
 * settings"; below it, the account card (avatar, name + role badge, phone,
 * edit), the Technicians / Notifications tiles, and full-width rows for
 * Customers and Log out. Logging out runs the same forced-logout flow as a
 * 401 expiry (story 5.3): the reset registry wipes every store, the token
 * is cleared, and `useAuth().reset()` sends the user back to login.
 *
 * Tile/row counts read the shared stores — `technicianCount` is server
 * truth on the profile; the customers row mirrors the Customers tab's own
 * store and the notifications tile mirrors the bells' unread count. Both
 * loaders are focus-throttled in their stores, so a focus refresh here
 * costs at most one request per window.
 */
import { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Bell, HardHat, LogOut, Pencil, Phone, ShieldCheck, Users } from 'lucide-react-native';
import { Avatar, Badge, Card, IconButton } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { useAuth } from '../auth';
import { EditNameSheet, formatPhone, formatRole, useMyProfile } from '../profile';
import { loadUnreadCount, useNotifications } from '../notifications';
import { loadCustomers, useCustomers } from '../customers';
import { MoreTile } from './components/MoreTile';
import { MoreRow } from './components/MoreRow';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

/**
 * A tab screen that also pushes root-stack routes (Technicians,
 * Notifications) — hence the composite navigation, the same shape
 * NotificationsScreen uses in mirror image.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'More'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MoreScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const tileSize = (width - spacing.s4 * 2 - spacing.s3) / 2;
  const { reset } = useAuth();
  const { profile, isLoading } = useMyProfile();
  const { unreadCount } = useNotifications();
  const { count: customerCount, hasLoaded: customersHasLoaded } = useCustomers();
  const [editNameOpen, setEditNameOpen] = useState(false);

  // Same throttled focus refresh the bells (Jobs/Home headers) and the
  // Customers tab run — at most one request per store per window.
  useFocusEffect(
    useCallback(() => {
      void loadUnreadCount();
      void loadCustomers();
    }, []),
  );

  // Server truth (`technicianCount`), not the local invite store. The API has
  // no active/offline split, so the tile shows the count only.
  const technicianCount = profile?.technicianCount ?? 0;
  const techSubtitle =
    technicianCount === 0
      ? 'Add your team'
      : `${technicianCount} ${technicianCount === 1 ? 'technician' : 'technicians'}`;

  // The count arrives async (null until the throttled count lands).
  const notificationsSubtitle =
    unreadCount === null
      ? 'Job & team updates'
      : unreadCount === 0
        ? 'All caught up'
        : `${unreadCount} unread`;

  // The customers count reads 0 while the first load is still in flight —
  // `hasLoaded` separates "no customers yet" from "not fetched", so the tile
  // never invites an owner to add a customer they may already have.
  const customersSubtitle = !customersHasLoaded
    ? 'People you serve'
    : customerCount === 0
      ? 'Add your first customer'
      : `${customerCount} ${customerCount === 1 ? 'customer' : 'customers'}`;

  const handleLogOut = () => {
    Alert.alert('Log out', 'You will need to verify your number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          // Same reset flow as a forced 401 logout (story 5.3): the registry
          // owns the store list — a hand-rolled copy here would drift the
          // first time a new store registers. The token must go too: a
          // manual logout used to leave the JWT attached to later requests.
          clearAuthToken();
          runAllResets();
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
        <Text style={styles.title}>Account &amp; settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card padding="none" style={styles.accountCard}>
          <View style={styles.accountRow}>
            <Avatar name={profile.name ?? undefined} size="lg" style={styles.avatar} />
            <View style={styles.rowInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {profile.name}
                </Text>
                <View style={styles.badgeWrap}>
                  <Badge
                    status="neutral"
                    size="sm"
                    icon={<ShieldCheck size={12} color={colors.textMuted} strokeWidth={2} />}>
                    {formatRole(profile.role)}
                  </Badge>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Phone size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.rowSubtitle}>{formatPhone(profile)}</Text>
              </View>
            </View>

            <IconButton
              label="Edit name"
              size="md"
              style={styles.editButton}
              onPress={() => setEditNameOpen(true)}>
              <Pencil size={18} color={colors.textMuted} strokeWidth={2} />
            </IconButton>
          </View>
        </Card>

        <View style={styles.tileRow}>
          <MoreTile
            icon={<HardHat size={22} color={colors.status.progress.solid} strokeWidth={1.5} />}
            iconBg={colors.status.progress.bg}
            title="Technicians"
            subtitle={techSubtitle}
            size={tileSize}
            onPress={() => navigation.navigate('Technicians')}
          />
          <MoreTile
            icon={<Bell size={22} color={colors.status.scheduled.solid} strokeWidth={1.5} />}
            iconBg={colors.status.scheduled.bg}
            title="Notifications"
            subtitle={notificationsSubtitle}
            size={tileSize}
            onPress={() => navigation.navigate('Notifications')}
          />
        </View>

        <MoreRow
          icon={<Users size={20} color={colors.status.done.solid} strokeWidth={1.5} />}
          iconBg={colors.status.done.bg}
          title="Customers"
          subtitle={customersSubtitle}
          onPress={() => navigation.navigate('Customers')}
        />

        <MoreRow
          danger
          icon={<LogOut size={20} color={colors.danger} strokeWidth={2} />}
          iconBg={colors.status.cancelled.bg}
          title="Log out"
          onPress={handleLogOut}
        />
      </ScrollView>

      <EditNameSheet
        visible={editNameOpen}
        currentName={profile.name}
        onClose={() => setEditNameOpen(false)}
      />
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
  accountCard: {
    gap: 0,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  // Squircle avatar per the More layout (mock): the token-rounded square,
  // not the default pill.
  avatar: {
    borderRadius: radius.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.heading,
    color: colors.textStrong,
    // Truncate instead of pushing the role badge to a second line, where the
    // badge's negative top margin would collide with the name above.
    flexShrink: 1,
  },
  // The role badge rides slightly high on the cap-height of the name beside
  // it (visual baseline alignment against the taller heading text).
  badgeWrap: {
    marginTop: -spacing.s2,
  },
  rowSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    // radius['2xl'] (28) >= half the 44px button, so the border renders as a
    // true circle — radius.pill is only 5px in this theme (a badge rounding).
    borderRadius: radius['2xl'],
  },
});
