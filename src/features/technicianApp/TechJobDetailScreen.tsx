/**
 * TechJobDetailScreen — placeholder body so Today/History card taps are
 * testable before the real screen exists (Story 3.1 registers the route,
 * Story 3.2 replaces this file wholesale with the technician-layout detail).
 */
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { IconButton } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { TechnicianRootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'TechJobDetail'>;

export default function TechJobDetailScreen({ navigation, route }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <IconButton label="Back" variant="ghost" onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>Job</Text>
        <Text style={styles.jobId}>{route.params.jobId}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    paddingHorizontal: spacing.s3,
    paddingTop: spacing.s2,
  },
  body: {
    padding: spacing.s4,
    gap: spacing.s1,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  jobId: {
    ...typography.body,
    color: colors.textStrong,
  },
});