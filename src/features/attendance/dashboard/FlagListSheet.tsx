/**
 * FlagListSheet — the dashboard's flag list sheet (Story 19-4 D6): ONE
 * sheet serving both kinds (Checkout missing / Fake location attempts).
 *
 * 19-5 (D7) — the rows are PRESSABLE: the day-level action deferred in
 * 19-4 ("open the calendar, correct the day arrives with 19-5's
 * production calendar host") lands here. A row press calls `onRowPress`
 * with the row; the OWNER (AttendanceDashboardScreen, which holds the
 * sheet state) closes the sheet AND navigates to the drill-down in the
 * SAME TICK (`AttendanceEmployeeMonth` at the flag's month, the day sheet
 * auto-opened) — the sheet is a NATIVE TrueSheet and would otherwise
 * float over the pushed screen on both platforms.
 *
 * Wire order is preserved (workDate asc, then name — the BE's sort), so
 * the oldest unhandled day surfaces first: the strip is the queue.
 */
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Sheet } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';
import {
  flagRowDetail,
  flagSheetTitle,
} from './dashboardModel';
import type {
  CheckoutMissingRow,
  FakeLocationRow,
} from '../../../services/resources/attendanceDashboard';

/** One fake-location row with its attempt count — the only rows that carry it. */
export type FlagListRow = CheckoutMissingRow &
  Partial<Pick<FakeLocationRow, 'attemptCount'>>;

export type FlagListSheetProps = {
  visible: boolean;
  /** null = closed-and-empty (no title) — the parent keeps one sheet instance. */
  kind: 'checkoutMissing' | 'fakeLocationAttempt' | null;
  rows: FlagListRow[];
  onClose: () => void;
  /** 19-5 D7: the row's deep-link — the OWNER closes the sheet and
   *  navigates in the same tick (never inside the sheet: the native
   *  sheet would float over the pushed screen). */
  onRowPress: (row: FlagListRow) => void;
};

export function FlagListSheet({
  visible,
  kind,
  rows,
  onClose,
  onRowPress,
}: FlagListSheetProps) {
  const title = flagSheetTitle(kind);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      detents={[0.75]}
      scrollable
      onDidPresent={() => {
        // The a11y floor idiom: say what opened, not its DOM shape.
        AccessibilityInfo.announceForAccessibility(
          `${title}, ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`,
        );
      }}>
      {/* The flag list is unbounded (one row per flagged employee-day), so
          the rows scroll inside the sheet's fixed 75% detent — the sibling
          OfficeFilterSheet's already-established idiom; a bare auto detent
          makes overflow rows unreachable (the review finding). */}
      <ScrollView
        contentContainerStyle={styles.rows}
        showsVerticalScrollIndicator={false}>
        {rows.map(row => (
          <Pressable
            key={`${row.employeeId}-${row.workDate}`}
            accessibilityRole="button"
            accessibilityLabel={`${row.employeeName}, ${flagRowDetail(row)}`}
            onPress={() => onRowPress(row)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
            <View style={styles.texts}>
              <Text style={styles.employee}>{row.employeeName}</Text>
              <Text style={styles.detail}>{flagRowDetail(row)}</Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2.2} />
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.s3,
    // Footer clearance: the pinned-footer lesson (reach the last row).
    paddingBottom: spacing.s4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min,
  },
  texts: {
    flex: 1,
    gap: spacing.s1,
  },
  employee: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  detail: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
