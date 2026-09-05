/**
 * CustomersScreen — the tenant's customer list from `GET /customers`, with
 * search and an "+ Add" action that pushes `AddCustomerScreen`.
 *
 * Renders exclusively from the shared `useCustomers` store (same source as
 * NewJob's picker), so there is exactly one fetch path to the endpoint. Focus
 * refetches go through `loadCustomers`, throttled to one request per
 * `FOCUS_REFRESH_TTL_MS`; pull-to-refresh forces past the throttle, and a
 * successful save pushes the created row straight into the store.
 *
 * Search filters the store list client-side — a deliberate choice, not a
 * limitation: the endpoint does take a `q` param (api-contracts.md §12), but
 * the store already holds every page, so filtering locally costs nothing and
 * the match semantics mirror the backend `q` (name OR phone) to keep a later
 * server-side switch invisible.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { Search, Users, UserPlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, EmptyState, InlineError } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { CustomerRow } from './components/CustomerRow';
import { filterCustomers } from './format';
import { loadCustomers, useCustomers } from './useCustomers';
import type { Customer } from './types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;

export default function CustomersScreen() {
  const navigation = useNavigation<Navigation>();
  const [query, setQuery] = useState('');

  const { customers, isLoading, error, hasCustomers, refresh } = useCustomers();

  // Refetch every time the tab is focused, not just on mount — the tab stays
  // mounted once opened, so a mount-only fetch would go stale as soon as a
  // customer is added elsewhere (another device, or server-side by a job).
  // The store throttles (skips within 15s of a success), so rapid tab
  // switches stay cheap; the first focus shows the spinner via the store's
  // `isLoading`, later ones refresh in place so switching doesn't blank the
  // list.
  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
    }, []),
  );

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next success).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  const filtered = useMemo(
    () => filterCustomers(customers, query),
    [customers, query],
  );

  // `AddCustomerScreen` pushes the created row into the shared store
  // directly (`upsertCustomer`) and force-refreshes it before returning, so
  // there's nothing to read back here — this screen's own `useCustomers()`
  // subscription re-renders from that same store automatically.
  const handleAdd = () =>
    navigation.navigate('AddCustomer', { returnRouteName: 'Customers' });

  const handleOpenCustomer = (customer: Customer) => {
    navigation.navigate('CustomerDetail', { customerId: customer.id });
  };

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Button
          variant="primary"
          size="md"
          shape="pill"
          onPress={handleAdd}
          leadingIcon={<UserPlus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          Add
        </Button>
      </View>

      {/* Search only earns its space once there's something to search. */}
      {hasCustomers ? (
        <View style={styles.searchWrap}>
          <View style={styles.searchField}>
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <RNTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search customers…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* A failed load with rows already on screen: keep the rows, explain
              why they may be stale. */}
          {error && hasCustomers && !errorDismissed ? (
            <View style={styles.bannerWrap}>
              <InlineError
                message={error}
                onDismiss={() => setErrorDismissed(true)}
              />
            </View>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <CustomerRow customer={item} onPress={handleOpenCustomer} />
            )}
            contentContainerStyle={[
              styles.listContent,
              filtered.length === 0 && styles.listContentEmpty,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={refreshControl}
            ListEmptyComponent={
              query.trim() ? (
                <EmptyState
                  icon={<Search size={36} color={colors.primary} strokeWidth={1.5} />}
                  title="No matches"
                  description={`No customer matches "${query.trim()}".`}
                />
              ) : error ? (
                <EmptyState
                  icon={<Users size={36} color={colors.danger} strokeWidth={1.5} />}
                  title="Couldn't load customers"
                  description={error}
                />
              ) : (
                // No CTA in the centre — the "Add" button in the header is the
                // single entry point, so this stays informational.
                <EmptyState
                  icon={<Users size={36} color={colors.primary} strokeWidth={1.5} />}
                  title="No customers yet"
                  description="Customers are added automatically when you create a job, or you can add them manually."
                />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  searchWrap: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    height: touch.comfort,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textStrong,
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  separator: {
    height: spacing.s3,
  },
});
