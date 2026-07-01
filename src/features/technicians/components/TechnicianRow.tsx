/**
 * TechnicianRow — a single technician in the list: avatar, name, phone and a
 * status badge (Active / Offline). Composes Card + Avatar + Badge.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Technician } from '../types';

type Props = {
  technician: Technician;
  onPress?: (technician: Technician) => void;
};

export function TechnicianRow({ technician, onPress }: Props) {
  const isActive = technician.status === 'active';

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(technician) : undefined}
      style={styles.row}>
      <Avatar name={technician.name} size="lg" />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {technician.name}
        </Text>
        <Text style={styles.phone} numberOfLines={1}>
          {technician.phone}
        </Text>
      </View>

      <Badge status={isActive ? 'done' : 'neutral'} dot>
        {isActive ? 'Active' : 'Offline'}
      </Badge>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
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
    fontSize: 16,
    color: colors.textStrong,
  },
  phone: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
