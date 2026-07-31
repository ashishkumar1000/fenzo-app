/**
 * CustomersScreen — the tenant's customer list from `GET /customers`, with
 * search and an "+ Add" action that opens the `AddCustomerSheet`.
 *
 * Fetches whenever the tab is focused, and again after a successful save, so a
 * newly added customer appears without a manual reload. Pull-to-refresh covers
 * everything else. Search filters the fetched list client-side — the endpoint
 * takes no query param.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Button, EmptyState, InlineError } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import { customerService } from '../../services';
import type { ApiError } from '../../services';
import { AddCustomerSheet } from './components/AddCustomerSheet';
import { CustomerRow } from './components/CustomerRow';
import { customerLocation } from './format';
import { DIAL_CODE } from './constants';
import type { Customer, NewCustomerInput } from './types';

export default function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  // Starts true so the first render is a loader, not a false "No customers yet".
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** First load shows the spinner; later focuses refresh silently. */
  const hasLoadedOnce = useRef(false);

  const fetchCustomers = useCallback(async () => {
    try {
      const page = await customerService.list();
      // TODO: `page.hasMore`/`page.nextCursor` are ignored — only the first
      // page renders until the list supports paging.
      setCustomers(page.data);
      setLoadError(null);
    } catch (err) {
      console.warn('[CustomersScreen] GET /customers failed →', err);
      setLoadError((err as ApiError).message);
    }
  }, []);

  /**
   * Refetch every time the tab is focused, not just on mount — the tab stays
   * mounted once opened, so a mount-only fetch would go stale as soon as a
   * customer is added elsewhere (another device, or server-side by a job).
   *
   * Only the first focus shows the spinner; later ones refresh in place so
   * switching tabs doesn't blank the list.
   */
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await fetchCustomers();
        if (!hasLoadedOnce.current) {
          hasLoadedOnce.current = true;
          setIsLoading(false);
        }
      })();
    }, [fetchCustomers]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchCustomers();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchCustomers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        customerLocation(c).toLowerCase().includes(q) ||
        c.phoneNumber.includes(q),
    );
  }, [customers, query]);

  const handleAdd = () => setSheetVisible(true);

  /**
   * `POST /customers`, then re-fetch the list so the new row shows up.
   *
   * Rejecting with the `ApiError` keeps the sheet open and shows the message;
   * resolving closes and resets it. Optional fields are omitted rather than
   * sent as empty strings, so the backend stores null instead of "".
   *
   * The endpoint has no `area` field, so Area is merged into the address line
   * as "<address>, <area>" — either part alone is sent on its own.
   */
  const handleSubmitCustomer = async (input: NewCustomerInput) => {
    const address = [input.address, input.area].filter(Boolean).join(', ');

    await customerService.create({
      name: input.name,
      countryCode: DIAL_CODE,
      phoneNumber: input.phone,
      ...(address ? { address } : {}),
      ...(input.city ? { city: input.city } : {}),
    });

    // Awaited before the sheet closes, so the list is already current when the
    // screen is revealed. A refresh failure here shouldn't look like a save
    // failure — the customer *was* created — so it surfaces as the list's own
    // error banner rather than being rethrown into the sheet.
    await fetchCustomers();
  };

  const handleOpenCustomer = (_customer: Customer) => {
    // TODO: navigate to a customer detail screen once it exists.
  };

  const hasCustomers = customers.length > 0;

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
          {loadError && hasCustomers ? (
            <View style={styles.bannerWrap}>
              <InlineError message={loadError} onDismiss={() => setLoadError(null)} />
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
              ) : loadError ? (
                <EmptyState
                  icon={<Users size={36} color={colors.danger} strokeWidth={1.5} />}
                  title="Couldn't load customers"
                  description={loadError}
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

      <AddCustomerSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={handleSubmitCustomer}
      />
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
