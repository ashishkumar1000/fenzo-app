/**
 * TechniciansScreen — full-screen route (pushed over the tabs). Shows the
 * zero-data empty state for a new account, or the technician list once the
 * owner has invited their team. The header "Add" button and the empty-state
 * CTA both open the AddTechnicianSheet.
 */
import { useState } from 'react';
import { FlatList, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, HardHat, UserPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { useTechnicians } from './useTechnicians';
import { AddTechnicianSheet } from './components/AddTechnicianSheet';
import { TechnicianRow } from './components/TechnicianRow';
import type { NewTechnicianInput } from './types';

type Props = NativeStackScreenProps<RootStackParamList, 'Technicians'>;

export default function TechniciansScreen({ navigation }: Props) {
  const { technicians, hasTechnicians, add } = useTechnicians();
  const [sheetVisible, setSheetVisible] = useState(false);

  const handleSubmit = (input: NewTechnicianInput) => {
    add(input);
    setSheetVisible(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Technicians</Text>
        </View>

        <Button
          variant="primary"
          size="md"
          onPress={() => setSheetVisible(true)}
          leadingIcon={<UserPlus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
          Add
        </Button>
      </View>

      {hasTechnicians ? (
        <FlatList
          data={technicians}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <TechnicianRow technician={item} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState
          icon={<HardHat size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No technicians yet"
          description="Add your team so you can assign jobs to them. They'll get an SMS invite to download the Fenzit app."
          ctaLabel="Add first technician"
          ctaIcon={<UserPlus size={20} color={colors.onPrimary} strokeWidth={2.5} />}
          onPressCta={() => setSheetVisible(true)}
        />
      )}

      <AddTechnicianSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={handleSubmit}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flex: 1,
  },
  backButton: {
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
});
