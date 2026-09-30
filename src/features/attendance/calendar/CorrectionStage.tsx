/**
 * CorrectionStage — the owner's correction form (Story 18-4, D2–D4),
 * rendered INSIDE DayDetailSheet as a stage morph (never a stacked sheet;
 * the 17-7 doctrine): under the SAME day heading, the day's StatusBadge
 * leads the flag-badge row (the mock's Frame B flagbadge), then the XOR
 * arms as a Times/Status SegmentedControl, the mode's fields (the two
 * times are the DS TimeField — the OS clock dialog, no keyboard, §10
 * D-TP2), the required note, the InlineError slot and "Save correction".
 *
 * The stage MOUNTS FRESH on every entry, so pre-fill derives from the
 * host's CURRENT row exactly once, at tap time; field values are LIFTED
 * above the mode switch, so Times → Status → Times keeps what was picked
 * while the XOR body builds from the ACTIVE mode's fields only.
 *
 * The WRITE stays host-owned (the sheet latches, flips `dismissible`,
 * maps the failure and morphs back on success — D4/D5); this component
 * renders the posture: Save disabled until the note trims non-empty AND
 * the active mode's fields are valid AND the check-out is after the
 * check-in (no error-shaming banner; the ordering copy shows in place),
 * the counter amber from 450 (the RevokeSheet anatomy).
 */
import { useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Badge,
  Button,
  InlineError,
  Input,
  SegmentedControl,
  TimeField,
} from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type {
  CorrectionStatus,
  CorrectionWriteBody,
} from '../../../services/resources/attendanceCorrections';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { isValidTime } from '../offices/officeFormModel';
import {
  DAY_STATUS_VISUALS,
  dayFlagVisuals,
  softBadgeIcon,
} from './dayStatusVisual';
import { buildOffsetInstant, tenantOffsetFromCarried } from './dayDetailModel';
import {
  MODE_OPTIONS,
  NOTE_MAX,
  NOTE_NEAR_LIMIT,
  STATUS_OPTIONS,
  initialMode,
  initialStatus,
  prefillCheckout,
  wallTime,
  type CorrectionMode,
} from './correctionStageModel';

export function CorrectionStage(input: {
  workDate: string;
  /** The host's CURRENT row — pre-fill derives from it at mount. */
  day: DayStatusRow | null;
  /** The host write in flight (Save spins; Back disables — sheet-owned). */
  submitting: boolean;
  /** The host-mapped failure (offline copy / server verbatim / transport). */
  errorMessage: string | null;
  onBack: () => void;
  /** The XOR body built from the ACTIVE mode's fields only. */
  onSave: (body: CorrectionWriteBody) => void;
}) {
  const { workDate, day, submitting, errorMessage, onBack, onSave } = input;

  // Lifted above the mode switch — mode flips retain every value (D2).
  const [mode, setMode] = useState<CorrectionMode>(() => initialMode(day));
  const [checkin, setCheckin] = useState(() => wallTime(day?.checkinAt));
  const [checkout, setCheckout] = useState(() => prefillCheckout(day, workDate));
  const [status, setStatus] = useState<CorrectionStatus>(() =>
    initialStatus(day),
  );
  const [note, setNote] = useState('');

  const checkinValid = isValidTime(checkin);
  const checkoutFilled = checkout.trim() !== '';
  const checkoutValid = isValidTime(checkout);
  const noteFilled = note.trim() !== '';
  // Zero-padded "HH:mm" compares chronologically as strings — the check
  // the picker makes possible (the typed field never guaranteed the shape).
  const orderValid = checkoutValid && checkout > checkin;

  // The Save gate (D2/D3 + D-TP2): note ≥ 1 after trim, and in Times mode
  // a valid check-in with a check-out that is valid AND after the check-in.
  // The ordering compare catches the reversed pair AND a next-day wall time
  // picked as check-out (22:00 → 01:10) — both block here with the field's
  // copy. What still passes and surfaces the wire's verbatim 422: a valid-
  // ORDER pair whose instant lands after the DB now (correcting today into
  // the future) — ATTENDANCE_INVALID_RANGE, the D4 posture. isValidTime
  // stays only as the safety net: the picker cannot emit a malformed value.
  const timesValid = checkinValid && (!checkoutFilled || orderValid);
  const saveDisabled =
    submitting || !noteFilled || (mode === 'times' && !timesValid);

  const checkoutError =
    checkoutFilled && checkoutValid && checkinValid && checkout <= checkin
      ? 'Check-out must be after check-in'
      : undefined;

  const save = () => {
    if (submitting || !noteFilled) return;
    if (mode === 'times' && !timesValid) return;
    const trimmed = note.trim();
    if (mode === 'status') {
      onSave({ status, note: trimmed });
      return;
    }
    // The offset CARRIES from the surface (D2/AD-7) — never derived here.
    const offset = tenantOffsetFromCarried(day?.checkinAt, day?.checkoutAt);
    onSave({
      checkinAt: buildOffsetInstant(workDate, checkin, offset),
      ...(checkoutFilled
        ? { checkoutAt: buildOffsetInstant(workDate, checkout, offset) }
        : {}),
      note: trimmed,
    });
  };

  const flags = day != null ? dayFlagVisuals(day) : [];
  const visual = DAY_STATUS_VISUALS[day?.status ?? 'not_tracked'];

  return (
    <View style={styles.block}>
      {/* The mock's Frame B flagbadge row: the day's STATUS badge leads —
          on a flag-less day (checkout-missing) it is the only badge, so
          the stage never opens bare under the heading. */}
      <View style={styles.flagRow}>
        <Badge
          status={visual.badgeStatus}
          icon={softBadgeIcon(visual.icon, visual.badgeStatus)}>
          {visual.label}
        </Badge>
        {flags.map(flag => (
          <Badge
            key={flag.key}
            status={flag.badgeStatus}
            size="sm"
            icon={softBadgeIcon(flag.icon, flag.badgeStatus)}>
            {flag.label}
          </Badge>
        ))}
      </View>

      <SegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={next => {
          setMode(next);
          // The a11y floor: the view swap announces (D2 patch 12).
          AccessibilityInfo.announceForAccessibility(
            next === 'times' ? 'Times mode' : 'Status mode',
          );
        }}
      />

      {mode === 'times' ? (
        <View style={styles.timeRow}>
          <TimeField
            label="Check-in time"
            value={checkin}
            placeholder="09:00"
            helper={checkin === '' ? 'Pick a check-in time' : undefined}
            onChangeValue={setCheckin}
            style={styles.timeInput}
          />
          <TimeField
            label="Check-out time (optional)"
            value={checkout}
            placeholder="18:00"
            error={checkoutError}
            onChangeValue={setCheckout}
            clearable
            style={styles.timeInput}
          />
        </View>
      ) : (
        <View>
          <Text style={styles.statusLabel}>Set day status</Text>
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={status}
            onChange={next => setStatus(next)}
          />
        </View>
      )}

      {/* The counter hugs the field (gap 0 — the block's s3 must not
          separate a counter from its own field). */}
      <View>
        <Input
          label="Note (required)"
          value={note}
          onChangeText={setNote}
          placeholder="What was wrong?"
          multiline
          maxLength={NOTE_MAX}
          accessibilityLabel="Note (required)"
        />
        <Text
          style={[
            styles.counter,
            note.length >= NOTE_NEAR_LIMIT ? styles.counterNearLimit : null,
          ]}>
          {note.length} / {NOTE_MAX}
        </Text>
      </View>

      {errorMessage !== null ? <InlineError message={errorMessage} /> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={save}
        disabled={saveDisabled}
        loading={submitting}
        accessibilityState={{ disabled: saveDisabled }}>
        Save correction
      </Button>
      <Button variant="ghost" size="lg" fullWidth onPress={onBack} disabled={submitting}>
        Back
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s3,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  timeInput: {
    flex: 1,
  },
  statusLabel: {
    ...typography.label,
    color: colors.textStrong,
    marginBottom: 6,
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
