/**
 * ReassignOfficeSheet — FR-6 reassignment for one employee (Story 15-9).
 * The 15-8 picker pattern (controlled DS `Sheet`, plain pressable rows —
 * NOT a FlatList inside the ScrollView Sheet) with what makes a
 * reassignment consequential and therefore worth confirming: the target
 * office is SELECTED (not committed) and the effective date is an
 * explicit, always-sent field.
 *
 * The effective date opens the full-screen DatePicker route (user-
 * directed: a calendar PAGE, not an inline calendar — an inline calendar
 * inside this scrollable sheet collided with the pinned confirm footer).
 * The date itself is CONTROLLED (`effectiveFrom` + `onEffectiveFromChange`)
 * — the host owns it, because the picker returns to the host's route, not
 * into the sheet.
 *
 * Defaults come from `reassignSheetDefaults`: covering employees move from
 * today (min today — FR-6 "from the date it's made, or a future date");
 * upcoming employees from their enrolment start (the only in-enrolment
 * dates; a later date is a legitimate scheduled move). Cancel at any point
 * writes nothing. The footer is pinned — the content carries footer
 * clearance padding and the footer is opaque so scrolled content never
 * shows through it.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, Check } from 'lucide-react-native';
import { Button, Sheet } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
import type { Office } from '../../../types/office';

type Props = {
  visible: boolean;
  /** The employee the move is for — names the sheet and every row's
   *  accessible label. */
  employeeName: string | null;
  offices: Office[];
  /** Sheet defaults from `reassignSheetDefaults(row, today)`. */
  defaultEffectiveFrom: string;
  minEffectiveFrom: string;
  /** CONTROLLED effective date — the host owns it (the full-screen
   *  DatePicker returns to the host's route). */
  effectiveFrom: string;
  onEffectiveFromChange: (date: string) => void;
  /** Opens the full-screen DatePicker for the effective date. */
  onPickDate: () => void;
  /** The move for this employee is in flight — the confirm button spins
   *  and the sheet cannot be dismissed out from under the write. */
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (officeId: string, effectiveFrom: string) => void;
};

export function ReassignOfficeSheet({
  visible,
  employeeName,
  offices,
  defaultEffectiveFrom,
  minEffectiveFrom,
  effectiveFrom,
  onEffectiveFromChange,
  onPickDate,
  isSubmitting = false,
  onClose,
  onConfirm,
}: Props) {
  const [officeId, setOfficeId] = useState<string | null>(null);

  // Fresh selection per presentation — a stale pick from the employee the
  // sheet last served must never ride along. (The date is the host's.)
  useEffect(() => {
    if (visible) {
      setOfficeId(null);
    }
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Change office"
      subtitle={
        employeeName
          ? `Where should ${employeeName} work from ${formatLongDate(effectiveFrom)}?`
          : undefined
      }
      detents={[0.75]}
      scrollable
      dismissible={!isSubmitting}
      footer={
        <View style={[styles.footer, isSubmitting && styles.footerBusy]}>
          <Button
            onPress={() => officeId && onConfirm(officeId, effectiveFrom)}
            disabled={!officeId || isSubmitting}
            loading={isSubmitting}
            fullWidth>
            {officeId
              ? `Move to ${offices.find((o) => o.id === officeId)?.name ?? 'office'}`
              : 'Pick an office'}
          </Button>
        </View>
      }>
      {offices.length === 0 ? (
        <Text style={styles.empty}>
          No offices yet — add one from Attendance offices first.
        </Text>
      ) : (
        <View style={styles.content}>
          {offices.map((office) => {
            const selected = office.id === officeId;
            return (
              <Pressable
                key={office.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Move ${employeeName ?? 'this employee'} to ${office.name}`}
                onPress={() => setOfficeId(office.id)}
                style={[styles.row, selected && styles.rowSelected]}>
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
                {selected ? (
                  <Check size={18} color={colors.primary} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            );
          })}

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Effective from</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Effective from: ${formatLongDate(effectiveFrom)}, tap to change`}
              onPress={onPickDate}
              style={({ pressed }) => [
                styles.dateFieldBox,
                pressed && styles.datePressed,
              ]}>
              <Text style={styles.dateValue}>{formatLongDate(effectiveFrom)}</Text>
              <CalendarDays size={20} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
            <Text style={styles.dateHelper}>
              {`Earliest ${formatLongDate(minEffectiveFrom)} · past records keep the current office`}
            </Text>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.s2,
    // Footer clearance: the pinned confirm floats above the scrolled body —
    // keep the last field reachable (the s32 token exists for exactly this;
    // the short form rarely scrolls, but the calendar month-strip habit
    // dies hard).
    paddingBottom: spacing.s32,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    padding: spacing.s4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfacePage,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfacePage,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  dateField: {
    marginTop: spacing.s2,
    gap: 6,
  },
  dateLabel: {
    ...typography.label,
    color: colors.textStrong,
  },
  dateFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 48,
    paddingHorizontal: spacing.s3,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
  },
  datePressed: {
    opacity: 0.85,
  },
  dateValue: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
  },
  dateHelper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.s4,
    // Opaque: the pinned footer floats above the scrolled body — translucent
    // footers show content through (found on device).
    backgroundColor: colors.surfaceCard,
  },
  footerBusy: {
    // Mid-submit the sheet is dismiss-locked; keep the surface steady.
    opacity: 0.95,
  },
});
