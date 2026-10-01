/**
 * AttendanceLeaveSection — the Attendance tab's Leave section (Stories
 * 17-5/17-6; extracted in 19-6 when the history_only posture began
 * hosting it WITHOUT the Apply row): SectionHead + — for the postures
 * that can apply (active/upcoming; the date floor is server-side) — the
 * apply entry row, over the tappable history rows. `applyable` is a
 * MOUNT-time prop: the parent renders this section inside each posture
 * branch, so a state flip remounts it (absent, not disabled).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { SectionHead } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';
import { LeaveHistorySection } from '../leave/LeaveHistorySection';

export function AttendanceLeaveSection({
  applyable,
  onApply,
  showApplyRow = true,
}: {
  applyable: boolean;
  onApply: () => void;
  /** The apply entry row's toggle (2026-10): the active posture's entry
   *  is now the tab's solid "Apply for leave" banner above — the row
   *  would be a second door to the same form. Upcoming/keep-default
   *  postures keep the row. Mount-time like `applyable` (posture branch). */
  showApplyRow?: boolean;
}) {
  return (
    <View style={styles.section}>
      <SectionHead title="Leave" />
      {applyable && showApplyRow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apply for leave"
          onPress={onApply}
          style={({ pressed }) => [
            styles.applyRow,
            pressed && styles.applyRowPressed,
          ]}>
          <Text style={styles.applyRowText}>Apply for leave</Text>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
      <LeaveHistorySection />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s2,
  },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.comfort,
  },
  applyRowPressed: {
    opacity: 0.85,
  },
  applyRowText: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
  },
});
