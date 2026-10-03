/**
 * ReportRequestForm — the "new report" card of the Reports screen (story
 * 12-6; the type row became the anticipated registry-fed Select in Epic
 * 21): type Select, range pickers and the people/offices pickers for the
 * selected type, plus the Generate button.
 *
 * The technician job report scopes by TECHNICIANS; the attendance report
 * scopes by OFFICES and/or EMPLOYEES (an empty employee selection = every
 * employee enrolled in attendance — the roster the screen hands in is
 * already enrolled-only). Generate is gated by `validateRange` exactly as
 * before (start ≤ end, ≤ 92 days inclusive, nothing future on the IST
 * clock); the backend re-validates every id.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import {
  Button,
  InlineError,
  MultiSelect,
  Select,
} from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Technician } from '../../technicians/types';
import {
  MAX_RANGE_DAYS,
  validateRange,
  type ReportTypeOption,
} from '../reportModel';
import { ReportRangeFields } from './ReportRangeFields';

type Props = {
  /** The selected registry type (availableTypes[0] until changed). */
  reportType: string;
  /** The types this owner may pick (attendance included only when gated in). */
  availableTypes: ReportTypeOption[];
  startDate: string;
  endDate: string;
  /** Job-report scope: the owner's whole technician roster. */
  selectedTechnicianIds: string[];
  technicians: Technician[];
  /** Attendance scope: live offices + the ENROLLED roster (picker options). */
  selectedOfficeIds: string[];
  offices: { id: string; name: string }[];
  selectedEmployeeIds: string[];
  employees: { id: string; name: string }[];
  /** True while the offices/enrolments reads for the attendance pickers load. */
  isLoadingScope: boolean;
  todayIso: string;
  isSubmitting: boolean;
  /** Failure of the last submit, already mapped to friendly copy. */
  submitError: string | null;
  onChange: (next: {
    startDate?: string;
    endDate?: string;
    technicianIds?: string[];
    officeIds?: string[];
    employeeIds?: string[];
  }) => void;
  onSelectType: (reportType: string) => void;
  onSubmit: () => void;
};

export function ReportRequestForm({
  reportType,
  availableTypes,
  startDate,
  endDate,
  selectedTechnicianIds,
  technicians,
  selectedOfficeIds,
  offices,
  selectedEmployeeIds,
  employees,
  isLoadingScope,
  todayIso,
  isSubmitting,
  submitError,
  onChange,
  onSelectType,
  onSubmit,
}: Props) {
  const selectedType =
    availableTypes.find(t => t.type === reportType) ?? availableTypes[0];
  const isAttendance = selectedType?.requiresAttendance === true;

  const technicianOptions = useMemo(
    () => technicians.map(t => ({ value: t.id, label: t.name })),
    [technicians],
  );
  const employeeOptions = useMemo(
    () => employees.map(e => ({ value: e.id, label: e.name })),
    [employees],
  );
  const officeOptions = useMemo(
    () => offices.map(o => ({ value: o.id, label: o.name })),
    [offices],
  );

  // The same gate the backend runs (DTO-level failures would 400 anyway) —
  // validating here keeps the button honest without a wasted round trip.
  const validationError = validateRange(startDate, endDate, `${todayIso}T00:00:00Z`);
  const canSubmit = validationError === null && !isSubmitting;

  return (
    <View style={styles.card}>
      <Select
        label="Report type"
        value={selectedType?.type}
        onChange={onSelectType}
        options={availableTypes.map(t => ({ value: t.type, label: t.label }))}
        disabled={availableTypes.length < 2}
      />
      <View style={styles.typeRow}>
        <View style={styles.typeIcon}>
          <FileText size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.typeInfo}>
          <Text style={styles.typeTitle}>{selectedType?.label}</Text>
          <Text style={styles.typeSubtitle}>{selectedType?.subtitle}</Text>
        </View>
      </View>

      <ReportRangeFields
        startDate={startDate}
        endDate={endDate}
        todayIso={todayIso}
        onChange={onChange}
      />

      {isAttendance ? (
        <>
          <MultiSelect
            label="Offices"
            value={selectedOfficeIds}
            onChange={ids => onChange({ officeIds: ids })}
            options={officeOptions}
            placeholder="All offices"
            helper="Leave empty to include every office"
          />
          <MultiSelect
            label="Employees"
            value={selectedEmployeeIds}
            onChange={ids => onChange({ employeeIds: ids })}
            options={employeeOptions}
            placeholder="All employees"
            helper={
              isLoadingScope
                ? 'Loading your team…'
                : 'Enrolled employees · leave empty to include everyone'
            }
          />
        </>
      ) : (
        <MultiSelect
          label="Technicians"
          value={selectedTechnicianIds}
          onChange={ids => onChange({ technicianIds: ids })}
          options={technicianOptions}
          placeholder="All technicians"
          helper={`Leave empty to include everyone · up to ${MAX_RANGE_DAYS}-day range`}
        />
      )}

      {submitError ? <InlineError message={submitError} /> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={isSubmitting}
        disabled={!canSubmit}
        onPress={onSubmit}>
        Generate report
      </Button>
      {!canSubmit && !isSubmitting && validationError ? (
        <Text style={styles.validation}>{validationError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s4,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeInfo: {
    flex: 1,
    gap: 1,
  },
  typeTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  typeSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  validation: {
    ...typography.caption,
    color: colors.danger,
  },
});
