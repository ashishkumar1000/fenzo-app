/**
 * LeaveHistorySection — the technician Attendance tab's leave history
 * (Story 17-6, spec D3): compact rows (no avatar) under the apply row,
 * each tappable into the SAME LeaveDetailSheet (identity hidden; the
 * reason and per-day states fully visible — FR-17 closed). 17-7 (spec D4):
 * Pending/Approved rows gain the outline-danger "Cancel request" entry —
 * the sheet's Cancel stage — with the write owned HERE: success replaces
 * the row in place, refetches the first page (cursor reset), announces,
 * and morphs the sheet back to the refreshed detail view; 409
 * already-handled closes the whole sheet and refetches. Embedded in the
 * tab's ScrollView, so pagination is a full-width secondary "Load more"
 * button rendered only while a cursor remains, with a transient spinner
 * while it fetches. Empty renders a single muted line (not an EmptyState —
 * the apply row above is the CTA).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, InlineError, Skeleton } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveRequestRow as LeaveRequestRowView } from './LeaveRequestRow';
import {
  LeaveDetailSheet,
  type LeaveDetailActionState,
} from './LeaveDetailSheet';
import { classifyLeaveWriteFailure } from './ownerLeaveModel';
import { useMyLeaveHistory } from './useMyLeaveHistory';

export function LeaveHistorySection() {
  const history = useMyLeaveHistory();
  const [detail, setDetail] = useState<LeaveRequestRow | null>(null);
  // The cancel write's state (17-7 D4) — the sheet never calls the API.
  const [actionState, setActionState] = useState<LeaveDetailActionState>({
    kind: 'idle',
  });
  const writeLatch = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runCancel = useCallback(() => {
    if (detail == null || writeLatch.current) return; // double-tap no-op
    writeLatch.current = true;
    setActionState({ kind: 'submitting', action: 'cancel' });
    attendanceLeaveService
      .cancelLeave(detail.id)
      .then(view => {
        if (!mounted.current) return;
        // Own-retry answers 200 here too (BE D7) — one success path. The
        // row replaces in place, then the first page refetches (cursor
        // reset — the employee-side list semantics, spec D4).
        AccessibilityInfo.announceForAccessibility('Leave cancelled');
        history.applyWriteView(view);
        history.reload();
        // The stage morphs back to the REFRESHED detail view (the write
        // response is authoritative — the optional split arrays are never
        // read unconditionally).
        setDetail(view);
        setActionState({ kind: 'idle' });
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        const failure = classifyLeaveWriteFailure(err, 'cancel');
        if (failure.kind === 'already-handled') {
          // No auto-close timer — the notice reads; OK closes the WHOLE
          // sheet, and the list refetches the row's truth.
          setActionState({ kind: 'handled' });
          history.reload();
          return;
        }
        // offline | failed — both carry the verbatim message.
        setActionState({ kind: 'error', message: failure.message });
      })
      .finally(() => {
        writeLatch.current = false;
      });
  }, [detail, history]);

  const onLoadMore = () => {
    void history.loadMore().then(count => {
      if (count > 0) {
        // The Accessibility Floor: Load more announces the appended count.
        AccessibilityInfo.announceForAccessibility(
          `${count} more requests loaded`,
        );
      }
    });
  };

  if (history.error && history.items.length === 0) {
    return (
      <View style={styles.block}>
        <InlineError message="Couldn't load leave requests. Check your connection and try again." />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {history.items.map(request => (
        <LeaveRequestRowView
          key={request.id}
          request={request}
          variant="compact"
          onPress={() => setDetail(request)}
        />
      ))}

      {history.items.length === 0 && history.loaded && !history.loadingFirst ? (
        <Text style={styles.empty}>No leave requests yet</Text>
      ) : null}

      {history.loadingFirst && history.items.length === 0 ? (
        // First load: a history-shaped shimmer, labelled (the 19-5 idiom);
        // the load-more append below keeps its inline spinner.
        <View accessibilityLabel="Loading attendance" style={styles.skeletonRow}>
          <Skeleton rows={2} height={56} />
        </View>
      ) : null}

      {history.hasCursor ? (
        history.loadingMore ? (
          <View style={styles.spinnerRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <Button variant="secondary" fullWidth onPress={onLoadMore}>
            Load more
          </Button>
        )
      ) : null}

      <LeaveDetailSheet
        visible={detail != null}
        request={detail}
        readOnly
        actionState={actionState}
        onClose={() => {
          if (actionState.kind === 'submitting') return; // latch mid-write
          setDetail(null);
          setActionState({ kind: 'idle' });
        }}
        onApprove={() => undefined}
        onReject={() => undefined}
        onCancelRequest={runCancel}
        onDismissHandled={() => {
          setDetail(null);
          setActionState({ kind: 'idle' });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s2,
  },
  empty: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  skeletonRow: {
    paddingVertical: spacing.s2,
  },
  spinnerRow: {
    paddingVertical: spacing.s2,
    alignItems: 'center',
  },
});
