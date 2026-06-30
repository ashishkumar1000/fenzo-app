import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import HomeHeader from '../components/HomeHeader';
import { Badge, Button, Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <>
      <HomeHeader />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Today's jobs</Text>

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
    </>
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
  sectionTitle: {
    ...typography.title,
    color: colors.textStrong,
    fontSize: 20,
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
