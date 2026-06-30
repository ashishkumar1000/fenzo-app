/**
 * CustomerRow — one row in the Customers list. Composes Card + Avatar.
 * Name + location on the left, lifetime value + job count on the right.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Customer } from '../types';

type Props = {
  customer: Customer;
  onPress?: (customer: Customer) => void;
};

const formatRupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export function CustomerRow({ customer, onPress }: Props) {
  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(customer) : undefined}
      style={styles.card}>
      <Avatar name={customer.name} size="md" />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {customer.name}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {customer.location}
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.value}>{formatRupees(customer.lifetimeValue)}</Text>
        <Text style={styles.jobs}>
          {customer.jobCount} {customer.jobCount === 1 ? 'job' : 'jobs'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.heading,
    color: colors.textStrong,
  },
  location: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  value: {
    ...typography.heading,
    color: colors.textStrong,
  },
  jobs: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
