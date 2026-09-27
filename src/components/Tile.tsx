/**
 * Tile — the icon-medallion row tile the attendance landing screens use
 * (Story 15-6: AttendanceHomeScreen's "Offices"/"Settings" pair and
 * AttendanceSettingsScreen's "Weekly off"/"Holidays" pair). Extracted from
 * the two screens' verbatim-duplicated copies so the row shape, the
 * pressed feedback and the a11y wiring live in one place (15-6 review
 * finding P14).
 *
 * App-specific composite (a Card + Pressable row), not a design-system
 * primitive — hence `src/components/`, alongside HomeHeader and
 * TechnicianPicker. Visual output is identical to the in-screen copies.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './ui';
import { colors, radius, spacing, typography } from '../theme';

export type TileProps = {
  icon: React.ReactNode;
  /** Medallion background — a status-tint `colors.status.*.bg`. */
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Disables the whole tile and announces it via `accessibilityState`. */
  disabled?: boolean;
};

/** Micro-gap between a row's title and subtitle — off the 4px token grid,
 * used as 2 by row components across the app (HolidayRow, TechnicianRow…). */
const TITLE_SUBTITLE_GAP = 2;
/** Pressed feedback — the app has no opacity token group (Button,
 * SegmentedControl etc. all carry local opacity literals); mirror that. */
const PRESSED_OPACITY = 0.85;

export function Tile({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
  disabled,
}: TileProps) {
  return (
    <Card padding="none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        // No `accessibilityHint`: it used to repeat the subtitle verbatim,
        // which screen readers announce twice (hint after label, subtitle
        // again when the row is read) (15-6 review iteration 1).
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tilePress,
          pressed && !disabled && styles.tilePressed,
        ]}>
        <View style={[styles.iconMedallion, { backgroundColor: iconBg }]}>
          {icon}
        </View>
        <View style={styles.tileTexts}>
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.tileSubtitle}>{subtitle}</Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  tilePress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  tilePressed: {
    opacity: PRESSED_OPACITY,
  },
  iconMedallion: {
    width: spacing.s10,
    height: spacing.s10,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTexts: {
    flex: 1,
    gap: TITLE_SUBTITLE_GAP,
  },
  tileTitle: {
    ...typography.heading,
    color: colors.textStrong,
  },
  tileSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
