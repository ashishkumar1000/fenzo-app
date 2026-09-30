/**
 * OfficeRuleFields — the timing/hours inputs of the office form
 * (Story 15-4). In edit mode the section carries the "changes take effect
 * from tomorrow" note as an info chip (server-enforced effective-dating;
 * profile fields apply immediately). Unit suffixes ("mins", "hrs") render
 * via the Input's trailing adornment.
 *
 * Start/End time are the DS `TimeField` (§10 D-TP3): the OS clock picker,
 * no keyboard — labels/placeholders/model untouched, the 18-5 default
 * seeds (09:30/18:30) open the picker pre-set; the model's format errors
 * remain as the unreachable safety net. The three minute/hour-count
 * fields stay typed.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { Card, Input, TimeField } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { OfficeFormErrors, OfficeFormState } from './officeFormModel';

type Props = {
  state: OfficeFormState;
  errors: OfficeFormErrors;
  onChange: (patch: Partial<OfficeFormState>) => void;
  /** Edit mode: show the effective-from-tomorrow note. */
  isEdit: boolean;
};

export default function OfficeRuleFields({ state, errors, onChange, isEdit }: Props) {
  return (
    <Card>
      <View style={styles.stack}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Timing &amp; hours</Text>
      </View>
      {isEdit ? (
        <View style={styles.noteChip}>
          <Info size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.noteText}>Changes take effect from tomorrow</Text>
        </View>
      ) : null}
      <View style={styles.timeRow}>
        <TimeField
          label="Start time"
          value={state.startTime}
          onChangeValue={(hhmm) => onChange({ startTime: hhmm })}
          placeholder="09:00"
          error={errors.startTime}
          style={styles.timeInput}
        />
        <TimeField
          label="End time"
          value={state.endTime}
          onChangeValue={(hhmm) => onChange({ endTime: hhmm })}
          placeholder="18:00"
          error={errors.endTime}
          style={styles.timeInput}
        />
      </View>
      <Input
        label="Late cut-off (minutes after start)"
        value={state.lateCutoffMinutes}
        onChangeText={(text) => onChange({ lateCutoffMinutes: text })}
        placeholder="15"
        error={errors.lateCutoffMinutes}
        helper="Grace period"
        keyboardType="number-pad"
        maxLength={3}
        trailingAdornment={<Text style={styles.suffix}>mins</Text>}
      />
      <View style={styles.timeRow}>
        <Input
          label="Full-day hours"
          value={state.fullDayHours}
          onChangeText={(text) => onChange({ fullDayHours: text })}
          placeholder="8"
          error={errors.fullDayHours}
          keyboardType="decimal-pad"
          maxLength={4}
          trailingAdornment={<Text style={styles.suffix}>hrs</Text>}
          style={styles.timeInput}
        />
        <Input
          label="Half-day hours"
          value={state.halfDayHours}
          onChangeText={(text) => onChange({ halfDayHours: text })}
          placeholder="4"
          error={errors.halfDayHours}
          keyboardType="decimal-pad"
          maxLength={4}
          trailingAdornment={<Text style={styles.suffix}>hrs</Text>}
          style={styles.timeInput}
        />
      </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  noteText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  timeInput: {
    flex: 1,
  },
  suffix: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
