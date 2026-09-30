/**
 * CorrectionHistory — the DayDetailSheet's corrections block (Story 18-3
 * D5), extracted so the sheet stays presentational. Rendered only when the
 * day carries a correction (the `latestCorrection` ABSENCE is the key —
 * never a null): the latest note is the sheet's business; this component
 * owns the disclosure ("Correction history · {n} corrections", count =
 * the loaded page's count) and the scrollable expanded list — actor + when
 * (a null actor renders "Owner"), "{old} → {new}" through the D6
 * formatter, the note quoted; a returned nextCursor renders "Show earlier"
 * and pages append.
 *
 * Fetch hygiene (state lens #3): fetches are KEYED by workDate — a resolve
 * for a non-current day or after dismissal is DISCARDED (Sheet content
 * stays mounted while closed; an unkeyed fetch would paint day B with day
 * A's history). Per-open UI state (expanded/error/loading) resets on
 * every open. The list scrolls inside a bounded box (the house Sheet's
 * native `scrollable` mode requires a fixed detent + footer; reachability
 * is the goal — 50 entries scroll fine in the box).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatOffsetInstantDate } from '../../../utils/offsetInstant';
import {
  fetchCorrections,
  formatCorrectionValue,
  type CorrectionEntry,
} from '../../../services/resources/attendanceCorrections';
import type { MonthStatusesScope } from './useMonthStatuses';

const PAGE_SIZE = 50;

export type CorrectionHistoryProps = {
  visible: boolean;
  workDate: string;
  /** The sheet's CURRENT row — only `latestCorrection`'s presence gates here. */
  hasCorrection: boolean;
  scope: MonthStatusesScope;
};

export function CorrectionHistory({
  visible,
  workDate,
  hasCorrection,
  scope,
}: CorrectionHistoryProps) {
  const [history, setHistory] = useState<CorrectionEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Mirrors for the stable closure: a resolve is DISCARDED unless it
  // answers the CURRENT day while the sheet is open.
  const workDateRef = useRef(workDate);
  workDateRef.current = workDate;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const seqRef = useRef(0);

  const fetchPage = useCallback(
    (key: string, employeeId: string | null, pageCursor?: string) => {
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      fetchCorrections({
        ...(employeeId != null ? { employeeId } : { me: true }),
        workDate: key,
        ...(pageCursor != null ? { cursor: pageCursor } : {}),
        limit: PAGE_SIZE,
      })
        .then(page => {
          if (key !== workDateRef.current || !visibleRef.current) return;
          if (seq !== seqRef.current) return;
          setHistory(prev =>
            pageCursor != null && prev != null
              ? [...prev, ...page.data]
              : page.data,
          );
          setCursor(page.nextCursor);
          setLoading(false);
        })
        .catch(() => {
          if (key !== workDateRef.current || !visibleRef.current) return;
          if (seq !== seqRef.current) return;
          setError("Couldn't load the correction history.");
          setLoading(false);
        });
    },
    [],
  );

  const fetchForScope = useCallback(
    (key: string, pageCursor?: string) => {
      fetchPage(key, scope.kind === 'owner' ? scope.employeeId : null, pageCursor);
    },
    [fetchPage, scope],
  );

  // Set when the first page FOR a day has been asked for — the fetch must
  // also fire when the OPEN day's row GAINS a correction from a host
  // refetch (the sheet follows live data; the disclosure must appear
  // without a close/reopen), so this cannot ride the reset effect alone.
  const fetchedKeyRef = useRef<string | null>(null);

  // Per-open reset (the LeaveDetailSheet visible-reset idiom): every open
  // starts clean — no carried expansion, history, cursor or error.
  useEffect(() => {
    if (!visible) return;
    setExpanded(false);
    setHistory(null);
    setCursor(null);
    setError(null);
    fetchedKeyRef.current = null;
  }, [visible, workDate]);

  // The first page: on open, on day switch, and when the open day gains
  // hasCorrection mid-session. Retry after an error goes through the
  // button, so this never re-fires for an already-asked day.
  useEffect(() => {
    if (!visible || !hasCorrection) return;
    if (fetchedKeyRef.current === workDate) return;
    fetchedKeyRef.current = workDate;
    fetchForScope(workDate);
  }, [visible, hasCorrection, workDate, fetchForScope]);

  if (!hasCorrection) return null;

  const entryCount = history?.length ?? 0;
  const showDisclosure = entryCount > 1;

  return (
    <>
      {error != null ? <InlineError message={error} /> : null}
      {error != null ? (
        <Button variant="secondary" onPress={() => fetchForScope(workDate)}>
          Retry
        </Button>
      ) : null}
      {loading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.spinner}
        />
      ) : null}

      {showDisclosure ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Correction history, ${entryCount} corrections`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(prev => !prev)}
          style={styles.disclosure}>
          <Text style={styles.disclosureLabel}>
            {`Correction history · ${entryCount} corrections`}
          </Text>
          {expanded ? (
            <ChevronDown size={18} color={colors.textBody} strokeWidth={2} />
          ) : (
            <ChevronRight size={18} color={colors.textBody} strokeWidth={2} />
          )}
        </Pressable>
      ) : null}
      {showDisclosure && expanded && history != null ? (
        <ScrollView style={styles.historyList} nestedScrollEnabled>
          {history.map(entry => (
            <View key={entry.id} style={styles.historyEntry}>
              <Text style={styles.historyMeta}>
                {`${entry.actorName ?? 'Owner'} · ${formatOffsetInstantDate(entry.correctedAt) ?? ''}`}
              </Text>
              <Text style={styles.historyChange}>
                {`${formatCorrectionValue(entry.oldValue)} → ${formatCorrectionValue(entry.newValue)}`}
              </Text>
              {entry.note.trim() !== '' ? (
                <Text style={styles.historyNote}>{`“${entry.note}”`}</Text>
              ) : null}
            </View>
          ))}
          {cursor != null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show earlier corrections"
              onPress={() => fetchForScope(workDate, cursor)}
              style={styles.showEarlier}>
              <Text style={styles.showEarlierLabel}>Show earlier</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  spinner: {
    alignSelf: 'center',
    paddingVertical: spacing.s2,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  disclosureLabel: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  historyList: {
    maxHeight: 320,
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  historyEntry: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    gap: 2,
  },
  historyMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  historyChange: {
    ...typography.bodySm,
    color: colors.textStrong,
  },
  historyNote: {
    ...typography.bodySm,
    color: colors.textBody,
  },
  showEarlier: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  showEarlierLabel: {
    ...typography.labelStrong,
    color: colors.textLink,
  },
});
