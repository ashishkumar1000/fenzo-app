/**
 * CorrectionStage — the owner's correction form (Story 18-4, D2–D4),
 * rendered INSIDE DayDetailSheet as a stage morph (never a stacked sheet;
 * the 17-7 doctrine): under the SAME day heading, the day's StatusBadge
 * leads the flag-badge row (the mock's Frame B flagbadge), then the XOR
 * arms as a Times/Status SegmentedControl, the mode's fields, the
 * required note, the InlineError slot and "Save correction".
 *
 * The stage MOUNTS FRESH on every entry, so pre-fill derives from the
 * host's CURRENT row exactly once, at tap time; field values are LIFTED
 * above the mode switch, so Times → Status → Times keeps what was typed
 * while the XOR body builds from the ACTIVE mode's fields only.
 *
 * The WRITE stays host-owned (the sheet latches, flips `dismissible`,
 * maps the failure and morphs back on success — D4/D5); this component
 * renders the posture: Save disabled until the note trims non-empty AND
 * the active mode's fields are valid (no error-shaming banner), a blocked
 * Times submit reveals the field errors in place, the counter amber from
 * 450 (the RevokeSheet anatomy).
 */
import { useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Clock } from 'lucide-react-native';
import { Badge, Button, InlineError, Input, SegmentedControl } from '../../../components/ui';
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

/** One office-form time field (the OfficeRuleFields anatomy verbatim:
 *  24-h placeholder, 5-char cap, numbers keyboard, Clock adornment). */
function TimeField(input: {
  label: string;
  value: string;
  placeholder: string;
  error: string | undefined;
  onChangeText: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <Input
      label={input.label}
      value={input.value}
      onChangeText={input.onChangeText}
      onBlur={input.onBlur}
      placeholder={input.placeholder}
      error={input.error}
      autoCapitalize="none"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      trailingAdornment={
        <Clock size={16} color={colors.textMuted} strokeWidth={2} />
      }
      style={styles.timeInput}
    />
  );
}

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
  const [touched, setTouched] = useState({ checkin: false, checkout: false });

  const checkinValid = isValidTime(checkin);
  const checkoutFilled = checkout.trim() !== '';
  const checkoutValid = isValidTime(checkout);
  const noteFilled = note.trim() !== '';

  // The Save gate (D2/D3): note ≥ 1 after trim, and in Times mode a valid
  // check-in with a valid optional check-out. What the gate does NOT see
  // across fields: a REVERSED pair (check-in after check-out) and a next-
  // day wall time both pass here and surface the wire's verbatim 422
  // ATTENDANCE_INVALID_RANGE — the D4 posture (honest server copy).
  const timesValid = checkinValid && (!checkoutFilled || checkoutValid);
  const saveDisabled =
    submitting || !noteFilled || (mode === 'times' && !timesValid);

  const checkinError =
    touched.checkin && checkin !== '' && !checkinValid
      ? 'Use 24-hour time, e.g. 09:00'
      : undefined;
  const checkoutError = !touched.checkout || checkout === ''
    ? undefined
    : !checkinValid
      ? 'Enter a check-in time first'
      : !checkoutValid
        ? 'Use 24-hour time, e.g. 18:00'
        : undefined;

  const save = () => {
    if (submitting || !noteFilled) return;
    // A blocked Times submit reveals the field errors in place (D2:
    // submit-time validation into the field slots) — pressing Save does
    // not blur a focused TextInput, so onBlur alone may never show them.
    if (mode === 'times' && !timesValid) {
      setTouched({ checkin: true, checkout: true });
      return;
    }
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
            error={checkinError}
            onChangeText={setCheckin}
            onBlur={() => setTouched(prev => ({ ...prev, checkin: true }))}
          />
          <TimeField
            label="Check-out time (optional)"
            value={checkout}
            placeholder="18:00"
            error={checkoutError}
            onChangeText={setCheckout}
            onBlur={() => setTouched(prev => ({ ...prev, checkout: true }))}
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
