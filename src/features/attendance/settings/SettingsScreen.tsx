/**
 * SettingsScreen — the Attendance Settings landing (Story 15-6).
 *
 * Owner-only. Three tiles (Weekly off, Holidays, Team enrolment) that
 * navigate to the dedicated screens. Mirrors the AttendanceHomeScreen tile
 * pattern (both consume the shared `Tile` component — 15-6 review finding
 * P14); kept minimal — wizard deep-links (15-8) bypass this and push the
 * individual routes directly. The Team enrolment tile is 15-9's roster
 * entry (the ongoing FR-2/FR-6 management surface outside the wizard).
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { CalendarDays, Calendar, Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../../theme';
import { Tile } from '../../../components/Tile';
import ScreenHeader from '../offices/ScreenHeader';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceSettings'>;

export default function SettingsScreen({ navigation }: Props) {
  // Back that works from anywhere: when this screen is the only route on
  // the stack (a deep link), `goBack` would strand the user — reset to the
  // tabs (the HolidaysScreen pattern).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Attendance settings" onBack={goBackSafely} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Tile
          icon={<Users size={20} color={colors.primary} strokeWidth={1.5} />}
          iconBg={colors.surfacePage}
          title="Team attendance"
          subtitle="Start dates, offices & tracking per employee"
          onPress={() => navigation.navigate('AttendanceEnrolments')}
        />
        <Tile
          icon={<CalendarDays size={20} color={colors.status.scheduled.solid} strokeWidth={1.5} />}
          iconBg={colors.status.scheduled.bg}
          title="Weekly off"
          subtitle="For everyone — change per employee"
          onPress={() => navigation.navigate('AttendanceWeeklyOff')}
        />
        <Tile
          icon={<Calendar size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
          iconBg={colors.status.progress.bg}
          title="Holidays"
          subtitle="Company holiday list"
          onPress={() => navigation.navigate('AttendanceHolidays')}
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
