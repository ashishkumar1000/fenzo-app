/**
 * EnrolmentRow — one roster row on the Team enrolment screen (Story 15-9).
 * Visual contract: the user-approved sample design (2026-09-28) — identity
 * header (solid-initial avatar, name + status pill, icon'd office line),
 * a labelled track toggle with a plain-English description, and the
 * hairline action panel (EnrolmentRowActions).
 *
 * Behavioural contract (UX-DR9 + spec-15-9):
 *  - never-enrolled rows: a "Starts today" button expands the calendar; a
 *    picked future date is carried on the next enable (the switch itself
 *    never writes a date the owner didn't pick);
 *  - upcoming rows: the switch is DISABLED (a bare enable would clamp the
 *    start to today and delete the future period); the panel restates the
 *    date, changes the office, or cancels the start;
 *  - enrolled rows: "Change office" opens the reassign sheet.
 * Dumb component: all writes and chip storage live in the screen.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, Phone } from 'lucide-react-native';
import { Avatar, Badge, Card, InlineError, InlineNotice, Switch } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { EnrolmentOverview } from '../../../services';
import { formatLongDate } from '../../../utils';
import {
  enrolmentCoversToday,
  rowState,
  startChipLabel,
  upcomingStart,
  type EnrolmentRowState,
} from './enrolmentsModel';
import { EnrolmentRowActions } from './EnrolmentRowActions';

type Props = {
  row: EnrolmentOverview;
  today: string;
  isPending: boolean;
  hasError: boolean;
  /** Pre-picked start date for this row (never-enrolled rows only). */
  pickedStart: string | null;
  /** Opens the full-screen DatePicker for this row's start date; the
   *  screen's return-dispatch applies the date per row state. */
  onPickStart: () => void;
  onToggleOn: () => void;
  onDisable: () => void;
  onCancelStart: () => void;
  onChangeOffice: () => void;
  /** "Moves to {office} from {date}" — set while a scheduled move is pending. */
  moveNote: string | null;
};

/** State pill per raw-truth state. */
const PILLS: Record<EnrolmentRowState, { label: string; status: 'done' | 'progress' | 'neutral' }> = {
  covering: { label: 'Active', status: 'done' },
  upcoming: { label: 'Upcoming', status: 'progress' },
  never: { label: 'Not tracked', status: 'neutral' },
};

/** Identity header secondary line — office (with icon) or the phone. */
function secondaryLine(
  row: Pick<EnrolmentOverview, 'officeId' | 'officeName' | 'phone'>,
): { icon: 'office' | 'phone'; text: string } {
  if (row.officeId) {
    return { icon: 'office', text: `Office: ${row.officeName ?? 'Unknown'}` };
  }
  return { icon: 'phone', text: row.phone };
}

export function EnrolmentRow({
  row,
  today,
  isPending,
  hasError,
  pickedStart,
  onPickStart,
  onToggleOn,
  onDisable,
  onCancelStart,
  onChangeOffice,
  moveNote,
}: Props) {
  const state = rowState(row, today);
  const covering = enrolmentCoversToday(row, today);
  const upcoming = upcomingStart(row, today);
  const pill = PILLS[state];
  const secondary = secondaryLine(row);

  const toggle = () => {
    if (isPending || state === 'upcoming') return;
    if (covering) {
      onDisable();
    } else {
      onToggleOn();
    }
  };

  // The start action's label: an upcoming row states its ACTUAL start (a
  // "Starts today" button under a "Starts 1 Nov" header contradicted the
  // row's own truth — review finding 2); a never row shows the pre-pick.
  const startActionLabel =
    state === 'upcoming'
      ? `Starts ${formatLongDate(upcoming ?? today)}`
      : startChipLabel(pickedStart, today);

  return (
    <Card padding="md">
      {/* Identity header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {row.employeeName.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {row.employeeName}
            </Text>
            <Badge status={pill.status} tone="soft" size="sm">
              {pill.label}
            </Badge>
          </View>
          <View style={styles.secondaryRow}>
            {secondary.icon === 'office' ? (
              <Building2 size={13} color={colors.textMuted} strokeWidth={2} />
            ) : (
              <Phone size={13} color={colors.textMuted} strokeWidth={2} />
            )}
            <Text style={styles.secondary} numberOfLines={1}>
              {secondary.text}
            </Text>
          </View>
          {state === 'upcoming' ? (
            <View style={styles.secondaryRow}>
              <CalendarDays size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.secondary} numberOfLines={1}>
                Starts {formatLongDate(upcoming ?? today)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Track toggle */}
      <View style={styles.toggleRow}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: covering, disabled: isPending || state === 'upcoming' }}
          accessibilityLabel={`Track attendance for ${row.employeeName}`}
          onPress={toggle}
          style={styles.toggleText}>
          <Text style={styles.toggleLabel}>Track attendance for {row.employeeName}</Text>
          <Text style={styles.toggleDescription}>
            {state === 'upcoming'
              ? `Tracking begins on their start date — nothing before that.`
              : 'They check in near their office.'}
          </Text>
        </Pressable>
        {/* In-flight write feedback: the switch is disabled while the PUT
            is pending — the spinner is what makes the wait legible. */}
        {isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : null}
        {/* The Pressable above is the ONE accessible switch (label + checked
            state); the DS control beside it is purely visual and hidden from
            the a11y tree — two switch roles for one control made the visible
            one anonymous (review finding 1). */}
        <View
          accessibilityElementsHidden={true}
          importantForAccessibility={'no-hide-descendants'}>
          <Switch
            value={covering}
            onValueChange={(next) => (next ? onToggleOn() : onDisable())}
            disabled={isPending || state === 'upcoming'}
          />
        </View>
      </View>

      <EnrolmentRowActions
        rowName={row.employeeName}
        state={state}
        startActionLabel={startActionLabel}
        upcoming={upcoming}
        onPickStart={onPickStart}
        onChangeOffice={onChangeOffice}
        onCancelStart={onCancelStart}
      />

      {moveNote ? (
        <View style={styles.note}>
          <InlineNotice message={moveNote} tone="info" />
        </View>
      ) : null}

      {hasError ? (
        <View style={styles.note}>
          <InlineError message="Couldn't save this change. Try again." />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.heading,
    color: colors.onPrimary,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textStrong,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  secondary: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s3,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  toggleDescription: {
    ...typography.caption,
    color: colors.textMuted,
  },
  note: {
    marginTop: spacing.s3,
  },
});
