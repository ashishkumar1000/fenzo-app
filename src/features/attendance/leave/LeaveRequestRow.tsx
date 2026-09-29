/**
 * LeaveRequestRow — the leave request's two list-row shapes (Story 17-6).
 * The OWNER variant (spec D2, mockup Frame B): interactive Card, Avatar md,
 * name + "{date range} · {n} working day(s)", the D6 status chip — omitted
 * on the Pending tab, where every row is pending and identical amber pills
 * are noise — and, for SPLIT requests (per-day states diverged, live since
 * 17-1..17-4's check-in auto-cancel), the honest "· {n} of {m} days
 * cancelled|revoked" suffix. The EMPLOYEE variant (spec D3): a compact
 * read-only row — no avatar, dates line first, count + part-day caption,
 * chip right — tappable into the read-only detail sheet.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarX,
  CheckCircle2,
  Clock,
  Undo2,
  XCircle,
} from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';
import type { LeaveRequestRow as LeaveRequestRowData } from '../../../services/resources/attendanceLeave';
import {
  formatLeaveRange,
  requestStatusChip,
  splitDaySummary,
  workingDaysCopy,
  type LeaveStatusIconName,
} from './leaveStatusModel';

/** The D6 glyph map — one rendering for every chip site (rows, sheet,
 *  split block). */
const CHIP_ICONS: Record<
  LeaveStatusIconName,
  typeof Clock
> = {
  Clock,
  CheckCircle2,
  XCircle,
  CalendarX,
  Undo2,
};

export function LeaveStatusBadge({
  status,
  size = 'md',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const chip = requestStatusChip(status);
  const Icon = CHIP_ICONS[chip.icon];
  return (
    <Badge status={chip.badge} tone="soft" size={size} icon={<Icon size={12} color={colors.status[chip.badge].fg} strokeWidth={2} />}>
      {chip.label}
    </Badge>
  );
}

/** The split suffix, computed once — null unless the span's per-day states
 *  actually diverged into cancelled/revoked days (spec D2). */
function splitLabel(request: LeaveRequestRowData): string | null {
  const split = splitDaySummary(request.dates);
  return split ? split.label : null;
}

export function LeaveRequestRow(input: {
  request: LeaveRequestRowData;
  variant: 'owner' | 'compact';
  /** Owner rows: the All tab shows the chip; Pending rows omit it (D2). */
  showStatus?: boolean;
  onPress?: () => void;
}) {
  const { request, variant, showStatus = false, onPress } = input;

  if (variant === 'compact') {
    const partNote =
      request.part === 'first_half'
        ? ' · First half'
        : request.part === 'second_half'
          ? ' · Second half'
          : '';
    const split = splitLabel(request);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Leave request, ${formatLeaveRange(
          request.startDate,
          request.endDate,
        )}, ${workingDaysCopy(request.workingDays)}, ${
          requestStatusChip(request.status).label
        }`}
        onPress={onPress}
        style={({ pressed }) => [styles.compact, pressed && styles.pressed]}>
        <View style={styles.compactTexts}>
          <Text style={styles.compactDates}>
            {formatLeaveRange(request.startDate, request.endDate)}
          </Text>
          <Text style={styles.compactCaption}>
            {workingDaysCopy(request.workingDays)}
            {partNote}
            {split ? ` · ${split}` : ''}
          </Text>
        </View>
        <LeaveStatusBadge status={request.status} size="sm" />
      </Pressable>
    );
  }

  const name = request.employeeName ?? 'Team member';
  const split = splitLabel(request);
  return (
    <Card
      interactive
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Leave request for ${name}, ${formatLeaveRange(
        request.startDate,
        request.endDate,
      )}, ${workingDaysCopy(request.workingDays)}, ${
        // The status must reach screen readers even though the flat label
        // replaces the badge child (17-6 review P3).
        requestStatusChip(request.status).label
      }`}>
      <View style={styles.ownerRow}>
        <Avatar name={name} size="md" />
        <View style={styles.ownerTexts}>
          <Text style={styles.ownerName}>{name}</Text>
          <Text style={styles.ownerSecondary}>
            {formatLeaveRange(request.startDate, request.endDate)} ·{' '}
            {workingDaysCopy(request.workingDays)}
            {split ? ` · ${split}` : ''}
          </Text>
        </View>
        {showStatus ? (
          <LeaveStatusBadge status={request.status} size="sm" />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.comfort,
    paddingVertical: spacing.s1,
  },
  compactTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  compactDates: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  compactCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  ownerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ownerName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  ownerSecondary: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
