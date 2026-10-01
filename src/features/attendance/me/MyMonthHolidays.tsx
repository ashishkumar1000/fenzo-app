/**
 * MyMonthHolidays — the self view's upcoming-holidays card (2026-10 My
 * Month redesign, extracted so AttendanceMyMonth stays under the
 * ≤300-line rule): each wire row renders as a soft AMBER band (the
 * scheduled family — an upcoming special day reads as "on a coming
 * date") behind a small flag tile, the holiday's bold name and its FULL
 * date ("Sunday, 4 Oct 2026") — a real calendar entry, not a bare text
 * line. Pure render: the data is the month summary hook's already-loaded
 * `upcomingHolidays`; no fetch, no state, no day-sheet wiring.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { Card, Eyebrow } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatHolidayFullDate } from '../monthly/monthlyModel';

export type MyMonthHolidayRow = { holidayDate: string; holidayName: string };

export function MyMonthHolidays({ holidays }: { holidays: MyMonthHolidayRow[] }) {
  const family = colors.status.scheduled;
  return (
    <Card padding="md">
      <Eyebrow>Upcoming holidays</Eyebrow>
      <View style={styles.rows}>
        {holidays.map(holiday => (
          <View
            key={holiday.holidayDate}
            accessibilityLabel={`${holiday.holidayName}, ${formatHolidayFullDate(holiday.holidayDate)}`}
            style={styles.row}>
            <View style={styles.iconTile}>
              <Flag size={16} color={family.fg} strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.name}>{holiday.holidayName}</Text>
              <Text style={styles.date} maxFontSizeMultiplier={1.4}>
                {formatHolidayFullDate(holiday.holidayDate)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.s2,
    marginTop: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.status.scheduled.bg,
    borderRadius: radius.md,
    padding: spacing.s2,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.scheduled.border,
  },
  rowText: {
    flex: 1,
    gap: spacing.s1,
  },
  name: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  date: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});