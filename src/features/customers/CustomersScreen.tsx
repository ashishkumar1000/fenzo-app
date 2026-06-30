/**
 * CustomersScreen — searchable customer list with an "+ Add" action.
 * Mock data via `data.ts` until a real customer service exists.
 */
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Search, UserPlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import { TextInput as RNTextInput } from 'react-native';
import { CustomerRow } from './components/CustomerRow';
import { MOCK_CUSTOMERS } from './data';
import type { Customer } from './types';

export default function CustomersScreen() {
  const [query, setQuery] = useState('');

  const customers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_CUSTOMERS;
    return MOCK_CUSTOMERS.filter(
      c => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q),
    );
  }, [query]);

  const handleAdd = () => {
    // TODO: navigate to an "Add customer" form once it exists.
  };

  const handleOpenCustomer = (_customer: Customer) => {
    // TODO: navigate to a customer detail screen once it exists.
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Button
          variant="primary"
          size="md"
          onPress={handleAdd}
          leadingIcon={<UserPlus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          Add
        </Button>
      </View>

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

      <FlatList
        data={customers}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <CustomerRow customer={item} onPress={handleOpenCustomer} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No customers match "{query}".</Text>
        }
        showsVerticalScrollIndicator={false}
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
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s10,
  },
});
