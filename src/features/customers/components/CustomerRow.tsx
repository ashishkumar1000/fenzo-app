/**
 * CustomerRow — one row in the Customers list. Composes Card + Avatar.
 * Name, then city · address, then phone on the left; job count and last-job
 * date on the right.
 *
 * No lifetime value: `GET /customers` doesn't return one.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import {
  customerLocation,
  customerPhone,
  formatShortDate,
  jobCountLabel,
} from '../format';
import type { Customer } from '../types';

type Props = {
  customer: Customer;
  onPress?: (customer: Customer) => void;
};

export function CustomerRow({ customer, onPress }: Props) {
  const location = customerLocation(customer);
  const lastJob = customer.lastJobDate ? formatShortDate(customer.lastJobDate) : '';

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
        {location ? (
          <Text style={styles.meta} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
        <Text style={styles.meta} numberOfLines={1}>
          {customerPhone(customer)}
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.jobCount}>{jobCountLabel(customer.jobCount)}</Text>
        {lastJob ? <Text style={styles.lastJob}>Last {lastJob}</Text> : null}
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
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  jobCount: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  lastJob: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
