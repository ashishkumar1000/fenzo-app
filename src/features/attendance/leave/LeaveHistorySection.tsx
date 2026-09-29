/**
 * LeaveHistorySection — the technician Attendance tab's leave history
 * (Story 17-6, spec D3): compact rows (no avatar) under the apply row,
 * each tappable into the SAME LeaveDetailSheet in read-only mode (identity
 * hidden, actions absent; the reason and per-day states fully visible —
 * FR-17 closed, and 17-7's Cancel home pre-built). Embedded in the tab's
 * ScrollView, so pagination is a full-width secondary "Load more" button
 * rendered only while a cursor remains, with a transient spinner while it
 * fetches. Empty renders a single muted line (not an EmptyState — the
 * apply row above is the CTA).
 */
import { useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveRequestRow as LeaveRequestRowView } from './LeaveRequestRow';
import {
  LeaveDetailSheet,
  type LeaveDetailActionState,
} from './LeaveDetailSheet';
import { useMyLeaveHistory } from './useMyLeaveHistory';

export function LeaveHistorySection() {
  const history = useMyLeaveHistory();
  const [detail, setDetail] = useState<LeaveRequestRow | null>(null);

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
        <View style={styles.spinnerRow}>
          <ActivityIndicator size="small" color={colors.primary} />
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
        actionState={{ kind: 'idle' }}
        onClose={() => setDetail(null)}
        onApprove={() => undefined}
        onReject={() => undefined}
        onDismissHandled={() => setDetail(null)}
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
  spinnerRow: {
    paddingVertical: spacing.s2,
    alignItems: 'center',
  },
});
