/**
 * WeeklyOffOverrideEmployeeField — the add-mode employee picker block of
 * `WeeklyOffOverrideSheet` (Story 15-6, FR-19).
 *
 * Two states: nothing picked yet (a full-width CTA card, disabled when the
 * tenant has no eligible employees) vs picked (avatar card + name + a
 * "Change" button that re-opens the shared SelectTechniciansScreen).
 * Mirrors the OverrideRow pattern on WeeklyOffScreen so the user recognises
 * the row shape across both surfaces.
 *
 * Extracted from `WeeklyOffOverrideSheet.tsx` to keep that file under the
 * ~300-line file limit (15-6 review P17).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ProfileTechnician } from '../../../services';

export type WeeklyOffOverrideEmployeeFieldProps = {
  /** Eligible employees (active only — the sheet's parent filters). */
  employees: ProfileTechnician[];
  /** The employee chosen via the shared picker, in add mode. */
  pickedEmployee?: ProfileTechnician;
  /** Re-open the shared technician picker. */
  onPickEmployee: () => void;
};

export default function WeeklyOffOverrideEmployeeField({
  employees,
  pickedEmployee,
  onPickEmployee,
}: WeeklyOffOverrideEmployeeFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>Employee</Text>
      {pickedEmployee ? (
        <View style={styles.employeeCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>
              {/* The same '?' fallback OverrideRow uses — a blank name must
                  not render an empty medallion (15-6 review iteration 1:
                  one behaviour for both avatar blocks). */}
              {(pickedEmployee.name || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.employeeName}>{pickedEmployee.name}</Text>
          <Button variant="secondary" size="sm" onPress={onPickEmployee}>
            Change
          </Button>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick an employee"
          onPress={onPickEmployee}
          disabled={employees.length === 0}
          style={({ pressed }) => [
            styles.pickCard,
            {
              opacity: employees.length === 0 ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          <Text style={styles.pickCardText}>
            {employees.length === 0 ? 'No employees yet' : 'Pick an employee'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s2,
  },
  label: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Picked state — card surface, avatar circle, name + Change on the row.
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...typography.heading,
    color: colors.primary,
  },
  employeeName: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
  },
  // Unpicked state — full-width CTA card that reads as the prominent
  // action when the employee still needs choosing.
  pickCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  pickCardText: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '500',
  },
});
