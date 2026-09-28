/**
 * OfficePickerSheet — the inline office picker of the Employees step
 * (Story 15-8). Opens the moment a switch is toggled on for an employee
 * with no office (UX-DR9: the switch does not commit until an office is
 * chosen — cancelling changes nothing); the options are LIVE offices only
 * (`archivedAt == null` — the completion gate counts only these, so the
 * picker may never offer a row the gate would reject).
 *
 * A controlled DS `Sheet` with plain pressable rows (not the `Select`
 * component) so the pick can open programmatically on toggle and each row
 * can carry a distinct accessible label naming the employee it is for.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Office } from '../../../types/office';

type Props = {
  visible: boolean;
  /** The employee the pick is for — names the sheet and every row's
   *  accessible label. */
  employeeName: string | null;
  offices: Office[];
  onClose: () => void;
  onPick: (officeId: string) => void;
};

export function OfficePickerSheet({
  visible,
  employeeName,
  offices,
  onClose,
  onPick,
}: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose an office"
      subtitle={employeeName ? `Where does ${employeeName} work?` : undefined}
      detents={[0.6]}
      scrollable>
      {/* Plain rows, not a VirtualizedList: the Sheet is a ScrollView and
          a nested FlatList trips RN's nesting warning on device; office
          lists are hand-scale (15-9 owns any roster-scale virtualizing). */}
      {offices.length === 0 ? (
        <Text style={styles.empty}>
          No offices yet. Add one from the Offices step first.
        </Text>
      ) : (
        offices.map((office) => (
          <Pressable
            key={office.id}
            accessibilityRole="button"
            accessibilityLabel={`Assign ${office.name} for ${employeeName ?? 'this employee'}`}
            onPress={() => onPick(office.id)}
            style={styles.row}>
            <View style={styles.rowIcon}>
              <Building2 size={18} color={colors.primary} strokeWidth={1.5} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {office.name}
              </Text>
              {office.rule ? (
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {`${office.rule.startTime}\u2013${office.rule.endTime}`}
                </Text>
             ) : null}
            </View>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

const ROW_ICON = 36;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowIcon: {
    width: ROW_ICON,
    height: ROW_ICON,
    borderRadius: ROW_ICON / 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
});
