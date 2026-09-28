/**
 * EnrolmentRowActions — the hairline action panel of a roster row (Story
 * 15-9): full-width buttons per the user-approved sample (soft-blue
 * start-date, neutral office, soft-danger cancel), plus the upcoming-row
 * reassurance caption and the inline calendar for the start pick.
 *
 * Per-state affordances (spec-15-9 matrix): never rows offer the start
 * chip only (a bare `PUT /office` would 422 — no reassign trigger);
 * upcoming rows add Change office + Cancel start; covering rows offer
 * Change office alone.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, ChevronDown, ChevronRight, X } from 'lucide-react-native';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
import { startChipLabel } from './enrolmentsModel';

type Props = {
  rowName: string;
  state: 'never' | 'upcoming' | 'covering';
  /** The row's current start action label (long-form for upcoming rows). */
  startActionLabel: string;
  upcoming: string | null;
  /** Opens the full-screen DatePicker (user-directed: a calendar PAGE, not
   *  an inline modal); the screen's return-dispatch applies the date. */
  onPickStart: () => void;
  onChangeOffice: () => void;
  onCancelStart: () => void;
};

export function EnrolmentRowActions({
  rowName,
  state,
  startActionLabel,
  upcoming,
  onPickStart,
  onChangeOffice,
  onCancelStart,
}: Props) {
  if (state === 'covering') {
    return (
      <View style={styles.panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change office for ${rowName}`}
          onPress={onChangeOffice}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Building2 size={16} color={colors.textStrong} strokeWidth={2} />
          <Text style={styles.neutralText}>Change office</Text>
          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${startActionLabel} for ${rowName}, tap to change`}
        onPress={onPickStart}
        style={({ pressed }) => [styles.button, styles.start, pressed && styles.pressed]}>
        <CalendarDays size={16} color={colors.primary} strokeWidth={2} />
        <Text style={styles.primaryText}>{startActionLabel}</Text>
        <ChevronDown size={16} color={colors.primary} strokeWidth={2} />
      </Pressable>
      {state === 'upcoming' && upcoming !== null ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change office for ${rowName}`}
            onPress={onChangeOffice}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Building2 size={16} color={colors.textStrong} strokeWidth={2} />
            <Text style={styles.neutralText}>Change office</Text>
            <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel the ${formatLongDate(upcoming)} start for ${rowName}`}
            onPress={onCancelStart}
            style={({ pressed }) => [styles.button, styles.danger, pressed && styles.pressed]}>
            <X size={16} color={colors.danger} strokeWidth={2.2} />
            <Text style={styles.dangerText}>
              Cancel the {formatLongDate(upcoming)} start
            </Text>
          </Pressable>
          <Text style={styles.reassure}>
            Nothing happens until {formatLongDate(upcoming)} — no
            reminders, no absent marks.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.s3,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.s2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 48,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  start: {
    backgroundColor: colors.primarySoft,
  },
  danger: {
    backgroundColor: palette.red50,
  },
  pressed: {
    opacity: 0.8,
  },
  primaryText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
    flex: 1,
  },
  neutralText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
    flex: 1,
  },
  dangerText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.danger,
    flex: 1,
  },
  reassure: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
