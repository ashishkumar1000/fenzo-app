/**
 * WeeklyOffDefaultSection — the tenant-default block of `WeeklyOffScreen`
 * (Story 15-6, FR-18): section label, helper copy, the 7 day pills, the
 * effective-date field, the Save CTA and the "Upcoming changes" panel.
 *
 * Presentational only — every piece of state lives in the screen, so the
 * screen owns the dirty/gating rules and this file owns the layout. Split
 * out to keep `WeeklyOffScreen.tsx` under the ~300-line file limit.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, DatePickerField, Eyebrow, InlineError, InlineNotice } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ApiError, IsoWeekday, WeeklyOffView } from '../../../services';
import { WeeklyOffDayPicker } from './WeeklyOffDayPicker';
import { describeDays, formatLongDate } from './weeklyOffModel';

export type WeeklyOffDefaultSectionProps = {
  /** No default row exists yet (first open) — swaps the helper copy. */
  neverConfigured: boolean;
  selectedDays: IsoWeekday[];
  onDayToggle: (next: IsoWeekday[]) => void;
  /** Save in flight — pills and the date field lock. */
  isSaving: boolean;
  /** All 7 days picked — FR-18's mirror gate. */
  sevenSelected: boolean;
  /** Zero days picked. */
  noWorkingDays: boolean;
  effectiveFrom: string;
  onEffectiveFromChange: (next: string) => void;
  today: string;
  saveError: ApiError | null;
  saveDisabled: boolean;
  onSave: () => void;
  /** Future-effective rows from the BE's `history` (ascending). */
  upcoming: WeeklyOffView[];
};

export function WeeklyOffDefaultSection({
  neverConfigured,
  selectedDays,
  onDayToggle,
  isSaving,
  sevenSelected,
  noWorkingDays,
  effectiveFrom,
  onEffectiveFromChange,
  today,
  saveError,
  saveDisabled,
  onSave,
  upcoming,
}: WeeklyOffDefaultSectionProps) {
  return (
    <>
      <Eyebrow>For everyone</Eyebrow>
      {neverConfigured ? (
        <Text style={styles.helper}>
          No weekly off set yet. By default Sunday is shown off — pick the
          days you'd like off. Save to apply for everyone.
        </Text>
      ) : (
        <Text style={styles.helper}>
          Pick the days everyone is off. Days not picked count as working
          days.
        </Text>
      )}

      <WeeklyOffDayPicker
        value={selectedDays}
        onChange={onDayToggle}
        disabled={isSaving}
      />

      {sevenSelected ? (
        <InlineNotice
          tone="info"
          message="Pick at least one working day — a full week off isn't allowed."
        />
      ) : noWorkingDays ? (
        <InlineNotice
          tone="info"
          message="Pick at least one day off — or save empty to clear the rule."
        />
      ) : null}

      <DatePickerField
        label="Starting"
        value={effectiveFrom}
        today={today}
        minDate={today}
        onChange={onEffectiveFromChange}
        placeholder={today}
        helper={
          effectiveFrom
            ? `Starting ${effectiveFrom}`
            : `Starting today (${today}) if you leave it blank`
        }
      />

      {saveError && !isSaving ? (
        <InlineError
          message={(saveError as ApiError).message ?? "Couldn't save. Try again."}
        />
      ) : null}

      <Button
        variant="primary"
        onPress={onSave}
        disabled={saveDisabled}
        loading={isSaving}
        fullWidth>
        Save
      </Button>

      {upcoming.length > 0 ? <UpcomingChangesPanel rows={upcoming} /> : null}
    </>
  );
}

/**
 * UpcomingChangesPanel — the future-effective rows from the BE's `history`
 * (sorted ascending by the BE). One row per scheduled edit, so the user can
 * see what changes are queued up. Each row shows the date and the day
 * description ("Sun only", "Fri + Sat", etc.) so the schedule is
 * unambiguous without needing to tap into anything.
 */
function UpcomingChangesPanel({ rows }: { rows: WeeklyOffView[] }) {
  return (
    <View style={styles.upcomingWrap}>
      <Eyebrow>Upcoming changes</Eyebrow>
      {rows.map((row, index) => (
        // `validFrom` alone is not a guaranteed-unique key (15-6 review
        // P16): the AD-8 exclusion constraint stops ranges OVERLAPPING, but
        // a malformed/duplicated payload would still render, and React
        // would drop the duplicate row silently. The index disambiguates
        // for this static, BE-ordered list.
        <View key={`${row.validFrom}-${(row.days ?? []).join(',')}-${index}`} style={styles.upcomingRow}>
          <Text style={styles.upcomingDate}>{formatLongDate(row.validFrom)}</Text>
          <Text style={styles.upcomingMeta}>{describeDays(row.days)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  upcomingWrap: {
    gap: spacing.s2,
    paddingTop: spacing.s2,
  },
  upcomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  upcomingDate: {
    ...typography.bodySm,
    color: colors.textStrong,
    fontWeight: '500',
  },
  upcomingMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
