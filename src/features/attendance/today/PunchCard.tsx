/**
 * PunchCard — the redesigned Today card (the 2026-10 tab redesign): two
 * punch tiles (in / out) with the arrow connector, then the status pills
 * row. A flat composition of theme tokens — the mockup's gradient banner
 * language renders here as tinted tiles/pills per DESIGN_SYSTEM.md (no
 * gradients).
 *
 * Rendered whenever the merged record exists (mid-session included: the
 * checkout tile reads "—" and the worked pill is absent), and it remains
 * after check-out — the done posture that replaces the button. Before any
 * record exists ("Check in" zero-state) the parent renders NOTHING here —
 * the zero-state's whitespace rule (DESIGN.md) beats an empty card.
 *
 * Pills:
 *   green  — the total-logged value ("0 h 01 m" / "Total logged")
 *   amber  — the late or early flag ("Early by 713 min" with an
 *            "11 h 53 m before shift" caption); late and early can
 *            legally coexist, each takes its own pill.
 */
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Clock, Timer, type LucideIcon } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, fontSize, radius, spacing, typography } from '../../../theme';
import type { TodayTilesModel } from './attendanceTodayModel';

/** Meridiem split: "4:06 AM" → ["4:06", "AM"] (the mockup's big-time +
 *  small-AM tile). Non-splitting input renders as one unit. */
function splitMeridiem(timeText: string): [string, string | null] {
  const space = timeText.lastIndexOf(' ');
  if (space <= 0) return [timeText, null];
  return [timeText.slice(0, space), timeText.slice(space + 1)];
}

function PunchTile({ label, timeText }: { label: string; timeText: string | null }) {
  const [big, meridiem] = timeText !== null ? splitMeridiem(timeText) : [null, null];
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      {big !== null && meridiem !== null ? (
        <Text style={styles.tileTime} maxFontSizeMultiplier={1.4}>
          {big}
          <Text style={styles.tileMeridiem}> {meridiem}</Text>
        </Text>
      ) : (
        <Text
          style={[styles.tileTime, styles.tileTimeEmpty]}
          maxFontSizeMultiplier={1.4}>
          {big ?? '—'}
        </Text>
      )}
    </View>
  );
}

function StatusPill({
  tone,
  icon,
  value,
  caption,
}: {
  tone: 'done' | 'checkoutMissing';
  icon: LucideIcon,
  value: string;
  caption: string | null;
}) {
  const c = colors.status[tone];
  const IconGlyph = icon;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={[styles.pillIcon, { backgroundColor: c.solid }]}>
        <IconGlyph size={12} color={colors.surfaceCard} strokeWidth={2.4} />
      </View>
      <View style={styles.pillText}>
        <Text style={[styles.pillValue, { color: c.fg }]} maxFontSizeMultiplier={1.4}>
          {value}
        </Text>
        {caption !== null ? (
          <Text style={[styles.pillCaption, { color: c.fg }]} maxFontSizeMultiplier={1.6}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PunchCard({ tiles }: { tiles: TodayTilesModel }) {
  // late and early can legally coexist (checked in after shift start AND
  // before one's shift began elsewhere) — they take SEPARATE pills; a `??`
  // fold here would caption the late value with early's before-shift line.
  const hasFlag = tiles.lateText !== null || tiles.earlyText !== null;
  return (
    <Card style={styles.card}>
      <View style={styles.tiles}>
        <PunchTile label="Check in" timeText={tiles.checkinText} />
        <View style={styles.arrow}>
          <ArrowRight size={14} color={colors.textMuted} strokeWidth={2.4} />
        </View>
        <PunchTile label="Check out" timeText={tiles.checkoutText} />
      </View>
      {tiles.workedText !== null || hasFlag ? (
        <View style={styles.divider} />
      ) : null}
      <View style={styles.pills}>
        {tiles.workedText !== null ? (
          <StatusPill tone="done" icon={Clock} value={tiles.workedText} caption="Total logged" />
        ) : null}
        {tiles.lateText !== null ? (
          // Late's caption would repeat the value ("Late by 12 min · 12 min
          // late"), so it renders value-only; early carries the
          // before-shift caption both pills' contract describes.
          <StatusPill tone="checkoutMissing" icon={Timer} value={tiles.lateText} caption={null} />
        ) : null}
        {tiles.earlyText !== null ? (
          <StatusPill
            tone="checkoutMissing"
            icon={Timer}
            value={tiles.earlyText}
            caption={tiles.earlyBeforeShiftText}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.s3,
    gap: spacing.s3,
  },
  tiles: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.s2,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
  },
  tileLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
    paddingTop: spacing.s3,
  },
  tileTime: {
    // One step under the old done-card's 36 (DESIGN.md checkin.time): two
    // tiles now carry the moment, so each one renders smaller.
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textStrong,
    paddingBottom: spacing.s3,
  },
  tileTimeEmpty: {
    color: colors.textDisabled,
    fontWeight: '600',
  },
  tileMeridiem: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  arrow: {
    alignSelf: 'center',
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    // Grow to fill the row, but size from CONTENT and never shrink — the
    // old flex:1 forced three coexisting pills (total + late + early can
    // legally coexist) to ⅓ width each, clipping "Late by 25 min" mid-word.
    // With a content basis they wrap to the next line instead.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  pillIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    gap: 1,
  },
  pillValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  pillCaption: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    opacity: 0.85,
  },
});