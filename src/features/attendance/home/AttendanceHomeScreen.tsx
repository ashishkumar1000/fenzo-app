/**
 * AttendanceHomeScreen — the owner entry into attendance (Story 15-6).
 *
 * For 15-6 this is a minimal shim: two tiles (Offices + Settings) so the
 * Settings landing is reachable through a real Home, matching the IA
 * diagram (`Attendance Home (Owner) ├─ …`). The real dashboard (15-8
 * setup wizard + 19+ employee/insights surface) extends this screen
 * without breaking 15-6's nav.
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Building2, Settings as SettingsIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../../theme';
import { Tile } from '../../../components/Tile';
import ScreenHeader from '../offices/ScreenHeader';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceHome'>;

export default function AttendanceHomeScreen({ navigation }: Props) {
  // Back that works from anywhere: when this screen is the only route on
  // the stack (a deep link — 15-8's wizard may land here), `goBack` would
  // strand the user — reset to the tabs (the HolidaysScreen pattern).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Attendance" onBack={goBackSafely} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Tile
          icon={<Building2 size={20} color={colors.status.scheduled.solid} strokeWidth={1.5} />}
          iconBg={colors.status.scheduled.bg}
          title="Offices"
          subtitle="Locations & timing rules"
          onPress={() => navigation.navigate('AttendanceOffices')}
        />
        <Tile
          icon={<SettingsIcon size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
          iconBg={colors.status.progress.bg}
          title="Settings"
          subtitle="Weekly off & holidays"
          onPress={() => navigation.navigate('AttendanceSettings')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
});
