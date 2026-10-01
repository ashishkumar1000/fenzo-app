/**
 * LeaveApplyFields — the shared leave-form body (Story 17-6, spec D4):
 * the presentational extraction of 17-5's Type / date-rows / count-chip /
 * reason blocks. Presentational ONLY — every value and handler arrives as
 * a prop; `leaveApplyModel.ts` stays the shared brain. The technician
 * `LeaveApplyScreen` renders identically through it (its tests pin the
 * anatomy), and `ApplyOnBehalfScreen` composes the same fields with the
 * count-chip slot replaced: the owner route has NO live preview (the
 * preview GET is technician-only — the owner JWT answers 403), so the
 * optional `countSlot` holds the muted one-liner instead.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react-native';
import {
  Eyebrow,
  InlineNotice,
  Input,
  SectionHead,
  SegmentedControl,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeavePart } from '../../../services/resources/attendanceLeave';
import type { LeavePreviewState } from './useLeaveApply';
import { LeaveDateRow } from './LeaveDateRow';
import { workingDaysCopy } from './leaveApplyModel';

const RESET_NOTE_MESSAGE =
  'Leave type reset to Full day — half day applies to a single date only.';
const EMPTY_COUNT_HINT = 'Pick dates to see the working-days count.';
const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;

/** The mock reason quick-picks (UI-only vocabulary — NOT a leave type; the
 *  wire carries no type field): a tap PREFILLS the Reason field with the
 *  phrase verbatim (the user's ruling) — the counter, the 500 cap and the
 *  single reason text are unchanged, so it is exactly a typing shortcut. */
const REASON_PRESETS = [
  'Sick leave',
  'Personal',
  'Family event',
  'Doctor visit',
];

/** One preset chip — a plain bordered pill, tapping prefills the Reason. */
function ReasonPreset({ text, onPick }: { text: string; onPick: (text: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use ${text} as the reason`}
      onPress={() => onPick(text)}
      style={({ pressed }) => [styles.preset, pressed && styles.presetPressed]}>
      <Text style={styles.presetText}>{text}</Text>
    </Pressable>
  );
}

export function LeaveApplyFields(input: {
  typeOptions: { value: LeavePart; label: string }[];
  part: LeavePart;
  onChangePart: (part: LeavePart) => void;
  resetNote: boolean;
  from: string | null;
  to: string | null;
  onOpenFromPicker: () => void;
  onOpenToPicker: () => void;
  /** The To row's Clear affordance — present only when To is filled. */
  onClearTo?: () => void;
  /** The technician live-preview state (ignored when `countSlot` is set). */
  preview: LeavePreviewState;
  /** Replaces the whole count area — the on-behalf screen's muted slot. */
  countSlot?: ReactNode;
  /** True while no From exists (the technician screen's hint condition). */
  showEmptyHint?: boolean;
  reason: string;
  onChangeReason: (reason: string) => void;
}) {
  const {
    typeOptions,
    part,
    onChangePart,
    resetNote,
    from,
    to,
    onOpenFromPicker,
    onOpenToPicker,
    onClearTo,
    preview,
    countSlot,
    showEmptyHint = false,
    reason,
    onChangeReason,
  } = input;
  const showChip =
    preview.status === 'ok' ||
    (preview.status === 'loading' && preview.workingDays != null);
  // The FIRST preview's wait now shows too (the 20-1 loading sweep): From is
  // picked, the GET is in flight and no old count exists to dim — a small
  // chip-shaped shimmer stands in the slot instead of blank space.
  const showFirstPreviewShimmer =
    preview.status === 'loading' && preview.workingDays == null && from != null;

  return (
    <>
      <View style={styles.block}>
        <Eyebrow>Type</Eyebrow>
        <SegmentedControl
          options={typeOptions}
          value={part}
          onChange={onChangePart}
        />
        {resetNote ? (
          <InlineNotice message={RESET_NOTE_MESSAGE} tone="neutral" icon={null} />
        ) : null}
      </View>

      <View style={styles.block}>
        <SectionHead title="Dates" />
        <View style={styles.rows}>
          <LeaveDateRow label="From" value={from} onPress={onOpenFromPicker} />
          <LeaveDateRow
            label="To"
            value={to}
            placeholder="Optional"
            onPress={onOpenToPicker}
            disabled={!from}
            onClear={to ? onClearTo : undefined}
          />
          {countSlot != null ? (
            countSlot
          ) : showChip ? (
            <View
              style={[
                styles.countChip,
                preview.status === 'loading' ? styles.countDim : null,
              ]}
              accessibilityLiveRegion="polite">
              <CalendarDays
                size={16}
                color={colors.status.progress.fg}
                strokeWidth={2}
              />
              <Text style={styles.countText}>
                {preview.workingDays != null
                  ? workingDaysCopy(preview.workingDays)
                  : null}
              </Text>
            </View>
          ) : preview.status === 'rejected' ? (
            <InlineNotice message={preview.message ?? ''} tone="info" />
          ) : preview.status === 'transport' ? (
            <InlineNotice message={preview.message ?? ''} tone="neutral" />
          ) : showFirstPreviewShimmer ? (
            <Skeleton rows={1} height={34} />
          ) : showEmptyHint ? (
            <Text style={styles.countHint}>{EMPTY_COUNT_HINT}</Text>
          ) : null}
          {/* With From not yet picked the "Pick dates" hint is the only
              content — no GET has started, so there is nothing to wait on. */}
        </View>
      </View>

      <View style={styles.block}>
        <SectionHead title="Reason (required)" />
        <View style={styles.presets}>
          {REASON_PRESETS.map(text => (
            <ReasonPreset key={text} text={text} onPick={onChangeReason} />
          ))}
        </View>
        <View style={styles.reasonField}>
          <Input
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Why do you need leave?"
            multiline
            maxLength={REASON_MAX}
            accessibilityLabel="Reason (required)"
          />
          <Text
            style={[
              styles.counter,
              reason.length >= REASON_NEAR_LIMIT ? styles.counterNearLimit : null,
            ]}>
            {reason.length} / {REASON_MAX}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s2,
  },
  rows: {
    gap: spacing.s3,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  preset: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  presetPressed: {
    opacity: 0.85,
  },
  presetText: {
    ...typography.label,
    color: colors.textBody,
  },
  reasonField: {
    gap: spacing.s1,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.status.progress.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  countDim: {
    opacity: 0.6,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.status.progress.fg,
  },
  countHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  counterNearLimit: {
    color: colors.status.scheduled.fg,
  },
});
