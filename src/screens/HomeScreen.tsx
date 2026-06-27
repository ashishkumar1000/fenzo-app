import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Badge, Button, Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <Text style={styles.title}>Fenzit</Text>
      <Text style={styles.subtitle}>Fenzit design system is wired up.</Text>

      <Card padding="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>AC not cooling</Text>
          <Badge status="progress" dot>
            In Progress
          </Badge>
        </View>
        <Text style={styles.cardMeta}>Quarterly service · 10:30 AM</Text>
      </Card>

      <View style={styles.badgeRow}>
        <Badge status="done" dot>
          Done
        </Badge>
        <Badge status="scheduled" dot>
          Scheduled
        </Badge>
        <Badge status="cancelled" dot>
          Cancelled
        </Badge>
      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={() =>
          navigation.navigate('Details', { itemId: 42, title: 'Hello' })
        }>
        Open details
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  card: {
    gap: spacing.s2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textStrong,
  },
  cardMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
});
