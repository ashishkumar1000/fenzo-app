/**
 * FlagListSheet — the dashboard's flag list sheet (Story 19-4 D6): ONE
 * sheet serving both kinds (Checkout missing / Fake location attempts).
 * Rows are plain Views, NOT pressable — the day-level action (open the
 * calendar, correct the day) arrives with 19-5's production calendar host;
 * a fake tap on a dead-end row is worse than no affordance (deferred
 * honestly, spec §Out of scope).
 *
 * Wire order is preserved (workDate asc, then name — the BE's sort), so
 * the oldest unhandled day surfaces first: the strip is the queue.
 */
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
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
};

export function FlagListSheet({ visible, kind, rows, onClose }: FlagListSheetProps) {
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
          <View key={`${row.employeeId}-${row.workDate}`} style={styles.row}>
            <Text style={styles.employee}>{row.employeeName}</Text>
            <Text style={styles.detail}>{flagRowDetail(row)}</Text>
          </View>
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
