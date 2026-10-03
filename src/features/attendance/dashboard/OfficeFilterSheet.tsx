/**
 * OfficeFilterSheet (Story 19-4, the redesign D7) — the dashboard's office
 * filter as a pick-then-apply sheet, not pick-and-commit: tapping a card
 * only SETS the draft; "Apply Filter" commits it (Reset reverts the pick).
 * Every dismissal that is not Apply (X, drag-down, back) discards the
 * draft — the filter never changes without the button.
 *
 * Rows are stat cards: the "All offices" card and one card per
 * NON-ARCHIVED office, each carrying today's tracked/checked-in tallies
 * from the dashboard envelope (`stats` — the same fetch as the tiles, so
 * the numbers can never disagree with them) plus a green "Active" chip on
 * a row someone has actually checked in at. The fallback source is the
 * sheet's own `officesService.list()` fetch (name-only rows, the old D7
 * behaviour) for as long as the deployed BE predates the envelope field —
 * it owns the skeleton/failed postures, because an empty-looking list
 * would read "you have no offices", which would be a lie when the request
 * just failed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowRight, Building2, LayoutGrid } from 'lucide-react-native';
import { Button, InlineError, Sheet, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { officesService } from '../../../services';
import { OfficeCard } from './OfficeCard';
import type { DashboardOfficeStat } from '../../../services';
import type { Office } from '../../../services';

type Posture = 'loading' | 'failed' | 'ready';

export type OfficeFilterSheetProps = {
  visible: boolean;
  /** null = "All offices"; else the picked officeId. */
  selected: string | null;
  /** Today's per-office stats from the dashboard envelope (null while the
   *  deployed BE predates the field or the main fetch's stats were
   *  malformed). Drives the subtitles + "Active" chips. */
  stats: DashboardOfficeStat[] | null;
  /** Commits the draft — the whole office (id + name) or null for "All
   *  offices"; the screen closes the sheet and reloads. */
  onPick: (office: { id: string; name: string } | null) => void;
  onClose: () => void;
};

export function OfficeFilterSheet({
  visible,
  selected,
  stats,
  onPick,
  onClose,
}: OfficeFilterSheetProps) {
  /** The card tapped but NOT yet applied — null = "All offices". */
  const [draft, setDraft] = useState<string | null>(selected);
  /** The name-only fallback registry (when the envelope carries no
   *  `offices`) — its fetch runs on every present, so a just-added office
   *  is never missing from its picker. */
  const [fallbackOffices, setFallbackOffices] = useState<Office[]>([]);
  const [fallbackPosture, setFallbackPosture] = useState<Posture>('loading');
  const seqRef = useRef(0);

  const loadFallback = useCallback(async () => {
    const seq = ++seqRef.current;
    setFallbackPosture('loading');
    try {
      const list = await officesService.list();
      if (seq !== seqRef.current) return;
      setFallbackOffices(list);
      setFallbackPosture('ready');
    } catch {
      if (seq !== seqRef.current) return;
      setFallbackPosture('failed');
    }
  }, []);

  // Fresh draft per presentation — a stale pick from the last presentation
  // must never ride along under Apply. Fresh fallback fetch when needed.
  useEffect(() => {
    if (visible) {
      setDraft(selected);
      if (stats === null) void loadFallback();
    }
    // `stats` is deliberately NOT a dep (the comment now matches the code):
    // the draft re-seeds on PRESENT — visible/selected only — so a stats
    // identity change from a background refetch while the sheet is open
    // must not re-seed the draft and discard the owner's un-applied pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selected, loadFallback]);

  /** The draft resolved to the pick payload (id + name for the screen's
   *  filter field without a second lookup). A draft whose id matches NO row
   *  (the office was removed mid-flight) is DEAD — committing it would
   *  resolve an empty name and blank the selector, so Apply bails. */
  const applyDraft = () => {
    if (draft === null) {
      onPick(null);
      return;
    }
    const row = stats?.find(o => o.id === draft) ??
      fallbackOffices.find(o => o.id === draft);
    if (!row) return;
    onPick({ id: draft, name: row.name });
  };

  /** The rows to render: envelope stats when available (stat attached),
   *  else the name-only fallback registry (stat null — no tally ever
   *  fabricated client-side). */
  const rows: Array<{
    id: string;
    name: string;
    stat: DashboardOfficeStat | null;
  }> =
    stats !== null
      ? stats.map(o => ({ id: o.id, name: o.name, stat: o }))
      : fallbackOffices.map(o => ({ id: o.id, name: o.name, stat: null }));

  const checkedInTotal =
    stats !== null
      ? stats.reduce((sum, o) => sum + o.checkedIn, 0)
      : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter by office"
      subtitle="Choose which office the numbers show."
      detents={[0.75]}
      scrollable
      onDidPresent={() => {
        AccessibilityInfo.announceForAccessibility(
          'Filter by office. Choose which office the numbers show.',
        );
      }}
      footer={
        <View style={styles.footer}>
          <Button
            variant="secondary"
            size="md"
            style={styles.footerButton}
            onPress={() => setDraft(null)}
            disabled={draft === null}>
            Reset
          </Button>
          <Button
            variant="primary"
            size="md"
            style={styles.footerButton}
            trailingIcon={
              <ArrowRight size={18} color={colors.onPrimary} strokeWidth={2} />
            }
            onPress={applyDraft}>
            Apply Filter
          </Button>
        </View>
      }>
      {stats === null && fallbackPosture === 'loading' ? (
        <View style={styles.posture}>
          <Skeleton rows={3} />
        </View>
      ) : stats === null && fallbackPosture === 'failed' ? (
        <View style={styles.posture}>
          {/* Non-dismissible retry inside the sheet: it re-fetches on every
              present, but a failed present must not read as an empty list
              (the old D7 posture, kept for the fallback source). */}
          <InlineError message="Couldn't load the offices. Check your connection and try again." />
          <Button
            variant="secondary"
            size="md"
            style={styles.retry}
            onPress={() => void loadFallback()}>
            Retry
          </Button>
        </View>
      ) : (
        <ScrollView
          // The office list is unbounded (a 15-office tenant), so the card
          // list scrolls inside the sheet's fixed 75% detent — the Sheet's
          // `scrollable` mode hands card drags off to the native sheet.
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>
              No offices yet — add one from Attendance offices first.
            </Text>
          ) : (
            <>
              <OfficeCard
                leading={
                  <LayoutGrid size={20} color={colors.onPrimary} strokeWidth={2} />
                }
                chipBg={colors.primary}
                title="All offices"
                subtitle={
                  stats !== null
                    ? stats.length > 0
                      ? `${stats.length} ${
                          stats.length === 1 ? 'location' : 'locations'
                        } registered · ${checkedInTotal} checked in today`
                      : 'No offices registered yet'
                    : undefined
                }
                a11yHint="Shows today's summary for every office together"
                selected={draft === null}
                onPress={() => setDraft(null)}
              />

              {/* One stat card per office. When the envelope carries stats
                  the rows come from `stats` (name + tallies together); the
                  fallback name-only list otherwise, in its name order. */}
              {rows.map(row => {
                const stat = row.stat;
                return (
                  <OfficeCard
                    key={row.id}
                    leading={
                      <Building2
                        size={20}
                        color={colors.status.progress.fg}
                        strokeWidth={2}
                      />
                    }
                    chipBg={colors.status.progress.bg}
                    title={row.name}
                    subtitle={
                      stat === null
                        ? undefined
                        : stat.tracked === 0
                          ? 'No one is on attendance here today'
                          : `${stat.tracked} tracked · ${stat.checkedIn} checked in today`
                    }
                    activeChip={stat !== null && stat.checkedIn > 0}
                    a11yHint={
                      stat === null
                        ? undefined
                        : stat.tracked === 0
                          ? 'No one is on attendance at this office today'
                          : `${stat.tracked} tracked, ${stat.checkedIn} checked in today`
                    }
                    selected={draft === row.id}
                    onPress={() => setDraft(row.id)}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  /** The scrollable card list — the pinned footer floats above it, so the
   *  scrolled content keeps footer clearance (the ReassignOfficeSheet
   *  lesson: opaque footer, reachable last row). */
  list: {
    // The first ScrollView inside a `scrollable` sheet hands its drags to
    // the native sheet — leave it flexible, the detent fixes the height.
  },
  listContent: {
    gap: spacing.s3,
    paddingBottom: spacing.s32,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s6,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.s3,
    padding: spacing.s4,
    // Opaque: the pinned footer floats above the scrolled body — translucent
    // footers show content through (found on device).
    backgroundColor: colors.surfaceCard,
  },
  footerButton: {
    flex: 1,
  },
  posture: {
    gap: spacing.s3,
    paddingBottom: spacing.s4,
  },
  retry: {
    marginTop: spacing.s2,
  },
});
