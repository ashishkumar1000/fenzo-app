/**
 * ReportRequestForm — the "new report" card of the Reports screen (story
 * 12-6): range pickers, technician MultiSelect and the Generate button.
 *
 - Only `technician_job_activity` exists in the registry today, so the type
 * renders as a fixed labelled row rather than a Select — when a second type
 * lands, this becomes a Select fed by the report registry's labels.
 *
 * Generate is gated by `validateRange` (start ≤ end, ≤ 92 days inclusive,
 * nothing in the future on the IST clock); an empty technician selection
 * means "all technicians", which is what the placeholder says.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { Button, InlineError, MultiSelect } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Technician } from '../../technicians/types';
import { MAX_RANGE_DAYS, validateRange } from '../reportModel';
import { ReportRangeFields } from './ReportRangeFields';

type Props = {
  startDate: string;
  endDate: string;
  selectedTechnicianIds: string[];
  /** The owner's roster — the MultiSelect's options. */
  technicians: Technician[];
  todayIso: string;
  isSubmitting: boolean;
  /** Failure of the last submit, already mapped to friendly copy. */
  submitError: string | null;
  onChange: (next: {
    startDate?: string;
    endDate?: string;
    technicianIds?: string[];
  }) => void;
  onSubmit: () => void;
};

export function ReportRequestForm({
  startDate,
  endDate,
  selectedTechnicianIds,
  technicians,
  todayIso,
  isSubmitting,
  submitError,
  onChange,
  onSubmit,
}: Props) {
  const options = useMemo(
    () => technicians.map(t => ({ value: t.id, label: t.name })),
    [technicians],
  );

  // The same gate the backend runs (DTO-level failures would 400 anyway) —
  // validating here keeps the button honest without a wasted round trip.
  const validationError = validateRange(startDate, endDate, `${todayIso}T00:00:00Z`);
  const canSubmit = validationError === null && !isSubmitting;

  return (
    <View style={styles.card}>
      <View style={styles.typeRow}>
        <View style={styles.typeIcon}>
          <FileText size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.typeInfo}>
          <Text style={styles.typeTitle}>Technician job report</Text>
          <Text style={styles.typeSubtitle}>
            Jobs, timing and proofs for your team
          </Text>
        </View>
      </View>

      <ReportRangeFields
        startDate={startDate}
        endDate={endDate}
        todayIso={todayIso}
        onChange={onChange}
      />

      <MultiSelect
        label="Technicians"
        value={selectedTechnicianIds}
        onChange={ids => onChange({ technicianIds: ids })}
        options={options}
        placeholder="All technicians"
        helper={`Leave empty to include everyone · up to ${MAX_RANGE_DAYS}-day range`}
      />

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