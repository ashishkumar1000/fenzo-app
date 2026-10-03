/**
 * DayDetailSheet — the FR-25 day sheet (Story 18-3 D5). Presentational over
 * the host's CURRENT row: `{ day }` re-renders live — never a mount-time
 * snapshot. Detail content: the full StatusBadge; the WRAPPING flag-tag
 * row; the grouped detail card (2026-10 redesign — bordered container, hairline
 * dividers, a green Check-in dot / blue Check-out dot from the status
 * families, Office with its building glyph). Distance lines: the wire
 * metres are the GPS-measured distance — non-null → " · 42 m from
 * {officeName}", exactly 0 → " · At the office"; a checkout carried on a
 * later date appends "(next day)". OMISSION RULE unchanged: a line with
 * no value renders nothing. Corrections (note quote + history) live in
 * CorrectionHistory; the quote renders as its own soft-amber note card
 * with the "Regularized by {actor}" attribution the wire carries.
 *
 * 18-4 stages (spec D1/D2 — a morph INSIDE this sheet, never a stacked
 * sheet; the 17-7 doctrine): `detail → correct → detail`. The owner-only
 * "Correct day" entry renders only when `canCorrectDay` holds AND the host
 * passed the write plumbing; the 19-6 self view passes `readOnly` — once
 * the proof pane's posture, now PRODUCTION (employees never correct; the
 * entry is doubly dead with the me-scope gate) and never sees it. The
 * correct stage keeps the day title and shows the day's times line as the
 * subtitle (the mock's sub-slot), mounts CorrectionStage FRESH per entry,
 * and morphs back on a saved write (D5), after which the host refreshes.
 *
 * 2026-10 self-view action: `onApplyLeave` (supplied by the me-scope
 * hosts) renders a primary "Apply leave" CTA that pushes the leave form
 * prefilled with the tapped date — employees never correct, but applying
 * leave for a flagged day is their own legitimate move. Absent prop = no
 * CTA (the owner sheet keeps "Correct day").
 *
 * 20-1 leave actions (ACs 1-11): on a day that carries an ACTIVE
 * pending/approved leave (`day.leaveRequestId` — the wire's authority),
 * "Apply leave" hides and the sheet offers the request's own moves: a
 * `detail → leaveCancel → detail` morph whose stage mounts CancelSheet
 * verbatim (17-7 grade — the wire's cutoff/split truth governs), and —
 * approved half-days, strictly future only — a `detail → convert →
 * detail` morph with ConvertStage's plain confirm copy. Cancel covers
 * today and the future; Convert never renders on today (the re-file's
 * LEAVE_CHECKED_IN_CONFLICT risk) nor on past days, and PENDING days
 * never convert (the wire cannot say WHICH half). The writes stay
 * HOST-OWNED (the 17-7 architecture, not the sheet's internal
 * saving/latch — that machinery serves the CORRECT write and its
 * different failure shape): the host passes `leaveRequest` (null while
 * resolving → the CTAs are absent, not disabled — AC 11) and the
 * `leaveActionState`, and owns the classify/refetch lifecycle; the sheet
 * only renders stages, spins on submitting and morphs back when a write
 * settles idle. An owner sheet passing none of the new props renders
 * byte-identically (AC 13).
 *
 * Write posture (D4): the press LATCHES in a ref (no idempotency key on
 * the wire — a same-tick double-tap would file TWO audit rows), one
 * release in `finally`; while in flight the sheet is `dismissible={false}`
 * and Back is disabled. A press-time offline probe shows the offline copy
 * and keeps every entry; a server failure renders its message verbatim; a
 * transport failure the connection line — mode, fields and note survive.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, CalendarX2, CheckCircle2 } from 'lucide-react-native';
import {
  Badge,
  Button,
  ConfirmDialog,
  InlineNotice,
  Sheet,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import type { CorrectionWriteBody } from '../../../services/resources/attendanceCorrections';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import type { MonthStatusesScope } from './useMonthStatuses';
import {
  canCancelLeaveDay,
  canConvertHalfDay,
  canCorrectDay,
  dayLabel,
  dayMonthLabel,
  daySheetTitle,
  dayTimesLine,
  instantValue,
  isLeaveDay,
  workedValue,
} from './dayDetailModel';
import { dayFlagVisuals, softBadgeIcon, DAY_STATUS_VISUALS } from './dayStatusVisual';
import { CorrectionHistory } from './CorrectionHistory';
import { CorrectionStage } from './CorrectionStage';
import { DayDetailLeaveStages } from './DayDetailLeaveStages';
import {
  formatLeaveRange,
  workingDaysCopy,
} from '../leave/leaveStatusModel';
import {
  OFFLINE_SAVE_MESSAGE,
  isOfflineNow,
  saveErrorMessage,
} from './correctionSavePosture';
import type { LeaveSheetActionState } from '../leave/ownerLeaveModel';

/** The stage morph (D2 + 20-1): detail → correct | leaveCancel | convert
 *  → detail. The leave stages mount the leave/ feature's reused stages. */
type DetailStage = 'detail' | 'correct' | 'leaveCancel' | 'convert';

/** The owner sheets' default — one stable identity so the leave effects
 *  never churn on a defaulted prop. */
const IDLE_LEAVE_STATE: LeaveSheetActionState = { kind: 'idle' };

export type DayDetailSheetProps = {
  visible: boolean;
  /** The tapped day — drives the title, the history key and the announce. */
  workDate: string | null;
  /** The host's CURRENT row for that day (null → "Not tracked" posture). */
  day: DayStatusRow | null;
  scope: MonthStatusesScope;
  /** The wire's tenant-local today echo — the D1 gate is data-driven. */
  today: string | null;
  onClose: () => void;
  /** The proof pane's posture: suppresses the Correct entry entirely. */
  readOnly?: boolean;
  /** The bound write (`correctDay`) — absent means no entry renders. */
  onCorrect?: (body: CorrectionWriteBody) => Promise<unknown>;
  /** The post-save host refresh (the D5 non-clearing month refresh). */
  onCorrected?: () => void;
  /** The 2026-10 me-scope CTA: pushes the leave form prefilled with the
   *  tapped date. Absent (owner sheets keep "Correct day"). */
  onApplyLeave?: (workDate: string) => void;
  /** 20-1 — the covering resolved request (AC 11: null while resolving
   *  or on a capped miss → the leave CTAs are absent, not disabled). */
  leaveRequest?: LeaveRequestRow | null;
  /** 20-1 — the host-owned leave write state (cancel + convert). */
  leaveActionState?: LeaveSheetActionState;
  /** 20-1 — the leave-cancel write (host-owned, latched in the host):
   *  fired by the dialog's confirm; the stage's own confirm is the
   *  error-retry press. */
  onCancelLeave?: () => void;
  /** 20-1 — the convert-full-day write (host-owned, latched in the
   *  host): fired by the dialog's confirm; the stage's own confirm is
   *  the error-retry press. */
  onConvertFullDay?: () => void;
  /** 20-1 — the handled notice's OK (AC 9): truth refetch + whole-sheet
   *  close (the sheet calls its own `onClose` after this resolves). */
  onLeaveWriteHandled?: () => void;
  /** 20-1 (user ask): true while the host's covering-request walk (AC 11)
   *  is still in flight — a small labelled shimmer in the slot the
   *  leave CTAs will occupy, never a silent blank. */
  leaveResolving?: boolean;
};

/** One labelled value row; a null/empty value renders NOTHING (the
 *  omission rule). `dot` tints the mock's instant dot (Check-in green /
 *  Check-out blue), `icon` swaps in the Office glyph — never both. */
function ValueRow({
  label,
  value,
  dot,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  dot?: string;
  icon?: typeof Building2;
}) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.kvRow}>
      <View style={styles.kvHead}>
        {Icon != null ? (
          <Icon size={15} color={colors.textMuted} strokeWidth={2} />
        ) : null}
        {dot != null ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text style={styles.kvLabel}>{label}</Text>
      </View>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function DayDetailSheet({
  visible,
  workDate,
  day,
  scope,
  today,
  onClose,
  readOnly = false,
  onCorrect,
  onCorrected,
  onApplyLeave,
  leaveRequest = null,
  leaveActionState = IDLE_LEAVE_STATE,
  onCancelLeave,
  onConvertFullDay,
  onLeaveWriteHandled,
  leaveResolving = false,
}: DayDetailSheetProps) {
  const [stage, setStage] = useState<DetailStage>('detail');
  // 20-1 (user ask): the leave CTAs pop the reusable ConfirmDialog FIRST,
  // and the dialog's confirm IS the one-more-time press — it fires the
  // write (see enterLeaveStage below); the stage it morphs to is the
  // in-flight/retry posture.
  const [leaveConfirm, setLeaveConfirm] = useState<'cancel' | 'convert' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The submit latch (D4): `saving` is async state — a same-tick
  // double-tap would file two audit rows before re-render.
  const latchRef = useRef(false);

  // Announce on present (the a11y floor): "Day detail, {d} {Month}".
  useEffect(() => {
    if (visible && workDate != null) {
      AccessibilityInfo.announceForAccessibility(
        `Day detail, ${daySheetTitle(workDate).split(', ')[1]}`,
      );
    }
  }, [visible, workDate]);

  // The stage never survives a close or a day switch — a reopen (or a
  // mid-open re-pick) lands on the detail stage with no carried form
  // state (the CorrectionSheet cross-day-leak rule; the LeaveDetailSheet
  // visible-reset idiom). The pending ask clears with it: the dialog's
  // confirm FIRES the write now, so a latched ask left past a re-truth
  // that moved `leaveRequestId` would pop unprompted over the next
  // leave day and its confirm would fire THAT day's write.
  useEffect(() => {
    if (visible) {
      setStage('detail');
      setLeaveConfirm(null);
    }
  }, [visible, workDate]);

  // The stage announce (18-4 a11y): the morph under the same heading is
  // invisible to a screen reader without it. 20-1 extends it to the leave
  // stages (the same floor).
  useEffect(() => {
    if (visible && workDate != null && stage !== 'detail') {
      const cue =
        stage === 'correct'
          ? `Correct attendance, ${dayMonthLabel(workDate)}`
          : stage === 'leaveCancel'
            ? `Cancel leave request, ${dayMonthLabel(workDate)}`
            : `Convert to full day, ${dayMonthLabel(workDate)}`;
      AccessibilityInfo.announceForAccessibility(cue);
    }
  }, [visible, stage, workDate]);

  const status = day?.status ?? 'not_tracked';
  const visual = DAY_STATUS_VISUALS[status];
  const flags = day ? dayFlagVisuals(day) : [];
  const latest = day?.latestCorrection;

  // 20-1 leave posture: the day's request id is the authority (AC 16 —
  // populated exactly when the day carries a pending/approved leave).
  const leaveActive = isLeaveDay(day);
  const leaveSubmitting = leaveActionState.kind === 'submitting';
  const leaveHandled = leaveActionState.kind === 'handled';
  // "Cancel request" — today + future, pending or approved (AC 1, 5, 7),
  // only once the covering request resolved (AC 11) and the host owns
  // the write. The CONVERT gate rides the row (AC 2): approved half-day,
  // strictly future — never today (AC 7), never pending (AC 5 note).
  const canCancelActive =
    leaveActive &&
    leaveRequest != null &&
    !leaveSubmitting && // NOT 'idle' — an error must not strand the CTAs;
    // re-entering the stage retries (the 17-7 posture), and 'handled'
    // never reaches this branch (the notice branch intercepts first).
    onCancelLeave != null &&
    workDate != null &&
    canCancelLeaveDay(day, today);
  const canConvertActive =
    leaveActive &&
    leaveRequest != null &&
    !leaveSubmitting &&
    onConvertFullDay != null &&
    workDate != null &&
    canConvertHalfDay(day, today);

  const canEnter =
    !readOnly &&
    onCorrect != null &&
    workDate != null &&
    canCorrectDay(day, today, scope);

  const handleSave = async (body: CorrectionWriteBody) => {
    if (latchRef.current || onCorrect == null) return;
    latchRef.current = true;
    setSaveError(null);
    setSaving(true);
    try {
      if (await isOfflineNow()) {
        setSaveError(OFFLINE_SAVE_MESSAGE);
        return;
      }
      await onCorrect(body);
      // D5: the stage morphs back to detail; the HOST refreshes — the row
      // (and the calendar cell) swap in place when the refetch lands.
      setStage('detail');
      // The morph-back swaps content under the same heading — invisible to
      // a screen reader without an explicit saved cue (the stage-announce
      // floor; triage patch 18-4-review).
      AccessibilityInfo.announceForAccessibility('Correction saved');
      onCorrected?.();
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      latchRef.current = false;
      setSaving(false);
    }
  };

  const enterStage = () => {
    setSaveError(null);
    setStage('correct');
  };

  // 20-1 write-settle morph (the 17-7 D3/D4 shape — a submitting→idle
  // transition IS a success): morph back to detail under the same heading
  // and announce; the host has already re-driven the day map by then.
  const prevLeaveStateRef = useRef<LeaveSheetActionState>(leaveActionState);
  useEffect(() => {
    const prev = prevLeaveStateRef.current;
    prevLeaveStateRef.current = leaveActionState;
    if (prev.kind === 'submitting' && leaveActionState.kind === 'idle') {
      setStage('detail');
      // The morph-back swaps content under the same heading — the same
      // stage-announce floor as the correction save.
      AccessibilityInfo.announceForAccessibility(
        prev.action === 'convert'
          ? 'Full-day request sent'
          : 'Leave cancelled',
      );
    }
  }, [leaveActionState]);

  // The leave stages' exits: Back morphs to detail; the handled cue's OK
  // closes the WHOLE sheet after the host refetches truth (AC 9).
  const backToDetail = () => setStage('detail');
  const leaveDone = () => {
    onLeaveWriteHandled?.();
    onClose();
  };
  // The confirm dialog's confirm IS the one-more-time press (2026-10-01
  // user decision: two presses total, Confirm Regularization feel): it
  // morphs to the stage and fires the write immediately — the stage then
  // reads as the in-flight posture, its confirm staying only for the
  // error-retry path. The write itself is host-latched (17-7), so a
  // double press cannot split the cancel.
  const enterLeaveStage = (which: 'cancel' | 'convert') => {
    setLeaveConfirm(null);
    setStage(which === 'cancel' ? 'leaveCancel' : 'convert');
    if (which === 'cancel') {
      onCancelLeave?.();
    } else {
      onConvertFullDay?.();
    }
  };
  // The sheet's subtitle slot follows the stage (the mock's sub-slot):
  // the correct stage keeps the day's times line; the cancel stage reads
  // like LeaveDetailSheet's (range + working days); convert/keep none.
  const cancelSubtitle =
    leaveRequest != null
      ? `${formatLeaveRange(leaveRequest.startDate, leaveRequest.endDate)} · ${workingDaysCopy(leaveRequest.workingDays)}`
      : undefined;

  return (
    <>
      <Sheet
      visible={visible}
      onClose={onClose}
      title={workDate != null ? daySheetTitle(workDate) : 'Day detail'}
      subtitle={
        stage === 'correct'
          ? dayTimesLine(day) ?? undefined
          : stage === 'leaveCancel'
            ? cancelSubtitle
            : undefined
      }
      detents={['auto']}
      dismissible={!saving && !leaveSubmitting}>
      {leaveHandled ? (
        <>
          <InlineNotice message="This request was already handled" tone="neutral" />
          <Button variant="secondary" size="lg" fullWidth onPress={leaveDone}>
            OK
          </Button>
        </>
      ) : stage === 'correct' && canEnter && workDate != null ? (
        <CorrectionStage
          workDate={workDate}
          day={day}
          submitting={saving}
          errorMessage={saveError}
          onBack={() => setStage('detail')}
          onSave={handleSave}
        />
      ) : (stage === 'leaveCancel' || stage === 'convert') &&
        workDate != null &&
        leaveRequest != null ? (
        // leaveRequest != null is the mount guard the stage layer's
        // docblock promises: if the request vanished mid-sheet (a raced
        // resolution), falling through to the detail body beats a blank
        // body with no Back.
        <DayDetailLeaveStages
          stage={stage}
          workDate={workDate}
          leaveRequest={leaveRequest}
          submitting={
            leaveActionState.kind === 'submitting' &&
            leaveActionState.action ===
              (stage === 'leaveCancel' ? 'cancel' : 'convert')
          }
          errorMessage={
            leaveActionState.kind === 'error' ? leaveActionState.message : null
          }
          onBack={backToDetail}
          onConfirm={
            stage === 'leaveCancel'
              ? onCancelLeave ?? (() => undefined)
              : onConvertFullDay ?? (() => undefined)
          }
          onHandled={leaveDone}
        />
      ) : (
        <>
          <Badge
            status={visual.badgeStatus}
            icon={softBadgeIcon(visual.icon, visual.badgeStatus)}>
            {dayLabel(day)}
          </Badge>

          {day != null && flags.length > 0 ? (
            // WRAPPING row: a clipped trust flag is a trust failure.
            <View style={styles.flagRow}>
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
          ) : null}

          {day != null ? (() => {
            // The grouped detail card (2026-10 mock): one bordered
            // container, hairline-divided rows, instant dots + the office
            // glyph. The omission rule filters the RAW set first (a hidden
            // row never leaves a divider or a gap behind), THEN adds the
            // dividers between what survived.
            const entries = ([
              ['Check-in', instantValue(day.checkinAt, day.checkinDistanceM, day.officeName, day.workDate), colors.status.done.solid, undefined],
              ['Check-out', instantValue(day.checkoutAt, day.checkoutDistanceM, day.officeName, day.workDate), colors.status.progress.solid, undefined],
              ['Worked', workedValue(day), undefined, undefined],
              ['Office', day.officeName, undefined, Building2],
            ] as const).filter(([, value]) => value != null && value !== '');
            if (entries.length === 0) return null;
            return (
              <View style={styles.detailCard}>
                {entries.map(([label, value, dot, icon], rowIdx) => (
                  <View key={label} style={[styles.itemRow, rowIdx > 0 ? styles.rowDivided : null]}>
                    <ValueRow label={label} value={value} dot={dot} icon={icon} />
                  </View>
                ))}
              </View>
            );
          })() : null}

          {latest != null && latest.note.trim() !== '' ? (
            // The correction note card: the quote plus the wire's actor
            // attribution ("Fixed by System Admin" in the mock).
            <View
              style={styles.noteCard}
              accessibilityLabel={
                latest.actorName
                  ? `Correction note: ${latest.note}. Fixed by ${latest.actorName}`
                  : `Correction note: ${latest.note}`
              }>
              <Text style={styles.noteQuote}>{`“${latest.note}”`}</Text>
              {latest.actorName ? (
                <Text style={styles.noteAttribution}>
                  {`Fixed by ${latest.actorName}`}
                </Text>
              ) : null}
            </View>
          ) : null}

          {workDate != null ? (
            <CorrectionHistory
              visible={visible}
              workDate={workDate}
              hasCorrection={latest != null}
              scope={scope}
            />
          ) : null}

          {canEnter ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onPress={enterStage}>
              Correct day
            </Button>
          ) : null}

          {leaveResolving && leaveActive && leaveRequest == null ? (
            // 20-1 (user ask): the sheet opened while the covering-request
            // walk (AC 11) is still in flight — a small labelled shimmer
            // in the slot the Cancel/Convert entries will occupy.
            <View accessibilityLabel="Loading request" style={styles.leaveResolvingSlot}>
              <Skeleton rows={1} height={44} />
            </View>
          ) : null}

          {canConvertActive ? (
            // AC 2 — the approved-future-half-day's primary move: reads
            // "the next move" like the Apply CTA it replaces.
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => setLeaveConfirm('convert')}>
              Convert to full day
            </Button>
          ) : null}

          {canCancelActive ? (
            // ACs 1/5/7 — pending or approved, today included; the stage's
            // CancelSheet (preview + split + cutoff truth) governs the
            // wire-fine boundary.
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setLeaveConfirm('cancel')}>
              Cancel request
            </Button>
          ) : null}

          {onApplyLeave != null && workDate != null && !leaveActive ? (
            // The 2026-10 me-scope CTA — employees never correct, but this
            // is their own leave form with the day prefilled. The primary
            // variant reads "the next move" like the mock's filled button.
            // 20-1 (AC 1/5): hidden on ANY active-leave day — a day already
            // covered by pending/approved leave never offers a second apply.
            <Button
              variant="primary"
              size="lg"
              fullWidth
              leadingIcon={
                <CalendarDays size={18} color={colors.onPrimary} strokeWidth={2} />
              }
              onPress={() => onApplyLeave(workDate)}>
              Apply leave
            </Button>
          ) : null}
        </>
      )}
      </Sheet>

      {/* 20-1 (user ask) — the leave CTAs' one-more-time modal, the
          Confirm Regularization reference adapted: badge + X header, bold
          date in the body, the request's facts as detail rows, then the
          confirm / keep pair. The dialog only ever mounts while the sheet
          is open and the write is idle. */}
      {leaveConfirm != null &&
      workDate != null &&
      today != null &&
      leaveRequest != null &&
      !leaveSubmitting ? (
        leaveConfirm === 'cancel' ? (
          <ConfirmDialog
            visible
            confirmVariant="danger"
            title="Cancel leave request?"
            icon={<CalendarX2 size={20} color={colors.textBody} strokeWidth={2} />}
            confirmLabel="Cancel request"
            cancelLabel="Keep request"
            message={
              <Text>
                Are you sure you want to cancel this leave request for{' '}
                <Text style={styles.messageStrong}>{daySheetTitle(workDate)}</Text>?
                You can apply again any time.
              </Text>
            }
            rows={[
              { label: 'Period', value: <Text>{formatLeaveRange(leaveRequest.startDate, leaveRequest.endDate)}</Text> },
              {
                label: 'Type',
                value: (
                  <Text>
                    {leaveRequest.part === 'full_day'
                      ? 'Full day'
                      : leaveRequest.part === 'first_half'
                        ? 'First half'
                        : 'Second half'}
                  </Text>
                ),
              },
              {
              label: 'Status',
              value: (
                <Text>
                  {leaveRequest.status === 'pending'
                    ? 'Waiting for approval'
                    : leaveRequest.status === 'approved'
                      ? 'Approved'
                      // A raced resolution (cancelled/rejected while the ask
                      // was open) must never read as "Approved".
                      : 'No longer active'}
                </Text>
              ),
            },
            ]}
            onConfirm={() => enterLeaveStage('cancel')}
            onCancel={() => setLeaveConfirm(null)}
          />
        ) : (
          <ConfirmDialog
            visible
            title="Convert to full day?"
            icon={<CheckCircle2 size={20} color={colors.textBody} strokeWidth={2} />}
            confirmLabel="Cancel and send new request"
            cancelLabel="Keep half day"
            message={
              <Text>
                Your half-day request for{' '}
                <Text style={styles.messageStrong}>{daySheetTitle(workDate)}</Text>{' '}
                will be cancelled, and a new full-day request will be sent. Your
                owner needs to approve it again. Your reason stays the same.
              </Text>
            }
            rows={[
              {
                label: 'Now',
                value: (
                  <Text>
                    Half day ·{' '}
                    {leaveRequest.status === 'approved'
                      ? 'Approved'
                      : leaveRequest.status === 'pending'
                        ? 'Waiting for approval'
                        : 'No longer active'}
                  </Text>
                ),
              },
              { label: 'After this', value: <Text>Full day · Waiting for approval</Text> },
            ]}
            onConfirm={() => enterLeaveStage('convert')}
            onCancel={() => setLeaveConfirm(null)}
          />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  detailCard: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
  },
  itemRow: {
    paddingVertical: spacing.s3,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    minHeight: 28,
  },
  kvHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  kvLabel: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  kvValue: {
    ...typography.body,
    color: colors.textStrong,
    textAlign: 'right',
    flexShrink: 1,
  },
  messageStrong: {
    color: colors.textStrong,
  },
  leaveResolvingSlot: {
    paddingVertical: spacing.s1,
  },
  noteCard: {
    backgroundColor: colors.status.scheduled.bg,
    borderWidth: 1,
    borderColor: colors.status.scheduled.border,
    borderRadius: radius.md,
    padding: spacing.s3,
    gap: spacing.s1,
  },
  noteQuote: {
    ...typography.body,
    color: colors.textBody,
  },
  noteAttribution: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
