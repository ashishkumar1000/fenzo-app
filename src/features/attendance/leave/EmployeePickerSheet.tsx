/**
 * EmployeePickerSheet — the apply-on-behalf team-member picker (Story 17-6,
 * spec D4; the OfficePickerSheet twin). Data is the enrolments roster
 * FILTERED TO TRACKED ROWS (`attendanceStartDate != null` — the ungated
 * per-employee truth; never `attendanceAccess` — module-gated, and never
 * `attendanceEnabled` — the tenant flag): a never-enrolled person must not
 * be pickable for a tracked leave. `officeName` is `string | null` on those
 * rows — a null renders the neutral "No office" fallback. The Search input
 * appears only past 8 rows (the OfficesScreen idiom; the needle filters
 * client-side by name). A controlled DS `Sheet` with plain pressable rows
 * (NOT a nested FlatList — the Sheet is a ScrollView).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Avatar, Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

/** The picker's row — the tracked subset of a roster row. */
export interface LeavePickerEmployee {
  employeeId: string;
  employeeName: string;
  officeName: string | null;
}

/** The name filter appears only past this many rows. */
const SEARCH_THRESHOLD = 8;

export function EmployeePickerSheet(input: {
  visible: boolean;
  employees: LeavePickerEmployee[];
  /** The roster GET in flight — a spinner holds the rows' place. */
  loading?: boolean;
  /** The roster GET failed — an honest error + Retry, never a
   *  permanent-sounding "no team members" (17-6 review P3). */
  error?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onPick: (employeeId: string) => void;
}) {
  const { visible, employees, loading = false, error = false, onRetry, onClose, onPick } = input;
  const [query, setQuery] = useState('');

  // A stale needle must not silently filter the next opening.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const showSearch = employees.length > SEARCH_THRESHOLD;
  // The needle only filters while the search box is on screen — if the
  // rows drop back under the threshold, the input unmounts and a
  // still-applied needle would silently hide rows with no way to clear it.
  const needle = showSearch ? query.trim().toLowerCase() : '';
  const filtered = useMemo(
    () =>
      needle
        ? employees.filter(e => e.employeeName.toLowerCase().includes(needle))
        : employees,
    [employees, needle],
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose team member"
      subtitle="Who is this leave for?"
      detents={[0.6]}
      scrollable>
      {loading ? (
        <Text style={styles.empty}>Loading your team…</Text>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.empty}>
            Couldn't load your team. Check your connection.
          </Text>
          <Button variant="secondary" onPress={onRetry}>
            Try again
          </Button>
        </View>
      ) : employees.length === 0 ? (
        <Text style={styles.empty}>
          No team members yet — enrol them from Attendance first.
        </Text>
      ) : (
        <>
          {showSearch ? (
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search team members..."
              autoCapitalize="none"
              autoCorrect={false}
              leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
            />
          ) : null}
          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              No team members match "{query.trim()}"
            </Text>
          ) : (
            filtered.map(employee => (
              <Pressable
                key={employee.employeeId}
                accessibilityRole="button"
                accessibilityLabel={`Apply leave for ${employee.employeeName}`}
                onPress={() => onPick(employee.employeeId)}
                style={styles.row}>
                <Avatar name={employee.employeeName} size="md" />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {employee.employeeName}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {employee.officeName ?? 'No office'}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s6,
  },
  errorWrap: {
    alignItems: 'center',
  },
});
