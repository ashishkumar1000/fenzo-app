/**
 * LeaveDetailSheet — the leave request's detail + action sheet (Story
 * 17-6, spec D2; 17-7 extends it with the revoke/cancel STAGE MORPH).
 * Owner mode: identity block, Type/Dates/Working days/Status key–value
 * rows, the verbatim reason in quotes, the split-only per-day block, and
 * the per-status action slot (`LeaveDetailActions`). Employee mode
 * (readOnly): identity hidden; Pending/Approved rows gain the "Cancel
 * request" entry.
 *
 * 17-7 stages (spec D1 — a morph INSIDE this sheet, never a stacked
 * sheet): `detail → revoke | cancel → detail`. Entering a stage swaps the
 * sheet title/subtitle and mounts the stage component fresh — stage state
 * (reason, preview, errors) resets on every entry, and the split preview
 * is refetched on EVERY entry, never cached (it is cutoff/midnight
 * sensitive). A write success swaps the refreshed view in (`request`
 * changes), which returns the sheet to the detail stage: the chip flips
 * grey only on a FULL revoke/cancel, while a split one keeps the derived
 * chip + the "· N of M days" row suffix.
 *
 * Lifecycle: the host owns the write; while it is in flight the sheet is
 * `dismissible={false}` (drag-down AND back blocked natively) and the
 * pressed button spins. A 409 already-handled swaps the content to the
 * neutral "This request was already handled" notice + an OK that closes —
 * deliberately NO auto-close timer; a failure keeps the sheet open with
 * the server's message above the buttons.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
// eslint-disable-next-line prettier/prettier -- file budget: one import line
import { Avatar, Button, InlineError, InlineNotice, Sheet } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveStatusBadge } from './LeaveRequestRow';
import {
  LEAVE_TYPE_LABELS,
  formatLeaveDate,
  formatLeaveRange,
  splitDaySummary,
  workingDaysCopy,
} from './leaveStatusModel';
import { LeaveDetailActions } from './LeaveDetailActions';
import { RevokeSheet } from './RevokeSheet';
import { CancelSheet } from './CancelSheet';

/** The host-reported write state (the sheet never calls the API itself).
 *  17-7 adds the revoke/cancel writes — same postures. */
export type LeaveDetailActionState =
  | { kind: 'idle' }
  | { kind: 'submitting'; action: 'approve' | 'reject' | 'revoke' | 'cancel' }
  | { kind: 'error'; message: string }
  /** 409 already-handled — content swaps to the notice + OK. */
  | { kind: 'handled' };

/** The stage morph (D1): detail → revoke | cancel → detail. */
type DetailStage = 'detail' | 'revoke' | 'cancel';

export function LeaveDetailSheet(input: {
  visible: boolean;
  request: LeaveRequestRow | null;
  /** true = the employee-history sheet (D3); gains the Cancel entry. */
  readOnly?: boolean;
  actionState: LeaveDetailActionState;
  onClose: () => void;
  onApprove: () => void;
  /** The trimmed reason — possibly '' (valid; the wire omits the field). */
  onReject: (reason: string) => void;
  /** The host-owned revoke write (owner, approved requests). */
  onRevoke?: (reason: string) => void;
  /** The host-owned cancel write (employee, own pending/approved). */
  onCancelRequest?: () => void;
  /** The already-handled notice's OK — closes the WHOLE sheet. */
  onDismissHandled: () => void;
}) {
  const { visible, request, readOnly = false, actionState, onClose, onApprove, onReject, onRevoke, onCancelRequest, onDismissHandled } = input;

  const [stage, setStage] = useState<DetailStage>('detail');

  useEffect(() => {
    if (visible) setStage('detail');
  }, [visible]);
  // The success morph (D3/D4): the host swaps the refreshed view in — a
  // changed request object always returns the sheet to the detail stage.
  useEffect(() => {
    setStage('detail');
  }, [request]);

  if (request == null) return null;

  const split = splitDaySummary(request.dates);
  const submitting = actionState.kind === 'submitting';
  const settled = actionState.kind !== 'handled';
  const canRevoke = !readOnly && request.status === 'approved' && settled && onRevoke != null;
  const canCancel =
    readOnly &&
    (request.status === 'pending' || request.status === 'approved') &&
    settled &&
    onCancelRequest != null;

  // The stage swaps the sheet's title/subtitle (announced via the header
  // semantics — the a11y floor, D6).
  const title =
    stage === 'revoke'
      ? 'Revoke leave'
      : stage === 'cancel'
        ? 'Cancel this leave request?'
        : readOnly
          ? 'Leave request'
          : request.employeeName ?? 'Leave request';
  const subtitle =
    stage === 'revoke'
      ? `${request.employeeName ?? 'Team member'} · ${formatLeaveRange(request.startDate, request.endDate)}`
      : stage === 'cancel'
        ? `${formatLeaveRange(request.startDate, request.endDate)} · ${workingDaysCopy(request.workingDays)}`
        : readOnly
          ? undefined
          : 'Leave request';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      detents={['auto']}
      dismissible={!submitting}>
      {actionState.kind === 'handled' ? (
        <>
          <InlineNotice message="This request was already handled" tone="neutral" />
          <Button variant="secondary" size="lg" fullWidth onPress={onDismissHandled}>
            OK
          </Button>
        </>
      ) : stage === 'revoke' && canRevoke ? (
        <RevokeSheet
          request={request}
          submitting={submitting && actionState.action === 'revoke'}
          errorMessage={actionState.kind === 'error' ? actionState.message : null}
          onBack={() => setStage('detail')}
          onConfirm={reason => onRevoke?.(reason)}
          onDismissHandled={onDismissHandled}
        />
      ) : stage === 'cancel' && canCancel ? (
        <CancelSheet
          request={request}
          submitting={submitting && actionState.action === 'cancel'}
          errorMessage={actionState.kind === 'error' ? actionState.message : null}
          onBack={() => setStage('detail')}
          onConfirm={() => onCancelRequest?.()}
          onDismissHandled={onDismissHandled}
        />
      ) : (
        <>
          {!readOnly ? (
            <View style={styles.identity}>
              <Avatar name={request.employeeName ?? ''} size="md" />
              <View style={styles.identityTexts}>
                <Text style={styles.identityName}>
                  {request.employeeName ?? 'Team member'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.kvRows}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Type</Text>
              <Text style={styles.kvValue}>{LEAVE_TYPE_LABELS[request.part]}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Dates</Text>
              <Text style={styles.kvValue}>
                {formatLeaveRange(request.startDate, request.endDate)}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Working days</Text>
              <Text style={styles.kvValue}>{workingDaysCopy(request.workingDays)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Status</Text>
              <LeaveStatusBadge status={request.status} size="sm" />
            </View>
          </View>

          {request.reason.trim() !== '' ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonText}>{`“${request.reason}”`}</Text>
            </View>
          ) : null}

          {split ? (
            <View style={styles.splitBlock}>
              {request.dates.map(day => (
                <View key={day.date} style={styles.splitRow}>
                  <Text style={styles.splitDate}>{formatLeaveDate(day.date)}</Text>
                  <LeaveStatusBadge status={day.state} size="sm" />
                </View>
              ))}
            </View>
          ) : null}

          {actionState.kind === 'error' ? (
            <InlineError message={actionState.message} />
          ) : null}

          <LeaveDetailActions
            request={request}
            readOnly={readOnly}
            visible={visible}
            submitting={submitting}
            approveInFlight={submitting && actionState.action === 'approve'}
            rejectInFlight={submitting && actionState.action === 'reject'}
            onApprove={onApprove}
            onReject={onReject}
            onEnterRevoke={canRevoke ? () => setStage('revoke') : undefined}
            onEnterCancel={canCancel ? () => setStage('cancel') : undefined}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  identityTexts: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  kvRows: {
    gap: spacing.s2,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    minHeight: 28,
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
  reasonBox: {
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  reasonText: {
    ...typography.body,
    color: colors.textBody,
  },
  splitBlock: {
    gap: spacing.s2,
    backgroundColor: colors.surfacePage,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    minHeight: 28,
  },
  splitDate: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});
