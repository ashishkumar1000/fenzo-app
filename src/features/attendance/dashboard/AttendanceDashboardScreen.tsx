/**
 * AttendanceDashboardScreen — the FR-24 owner dashboard (Story 19-4): the
 * today snapshot — five KPI tiles, the two flag strips (past-day truth
 * until handled) and the office filter. Strictly READ-ONLY: the screen
 * never writes, never recounts — the BE engine (19-2) is the single FR-10
 * source and the FE renders its envelope.
 *
 * State postures (spec D9/D10):
 *   - ONE dashboard fetch per appearance: `useFocusEffect` performs the
 *     fetch, so the FIRST FOCUS IS THE INITIAL LOAD (no separate mount
 *     fetch — never two round-trips in the first second). Every later
 *     focus / AppState-`active` is a refetch (the useCheckInOut idiom).
 *   - First load → the DS `Skeleton` in place of tiles+strips (the filter
 *     row is static chrome and renders immediately).
 *   - Refetch failure keeps the last-good render and surfaces
 *     InlineError + Retry BELOW the content (no clearing spinner after
 *     first load — the 18-4 D5 posture generalized to a read screen).
 *   - First-load failure has nothing stale to keep → the same composition
 *     replaces the content region.
 *   - `tracked === 0` → the tile grid REPLACES with the empty state (flag
 *     strips still render — a flag can outlive today's roster).
 *
 * The wire's `date` echo is consumed by the fail-closed normalizer only —
 * the screen IS today, so the echo renders nowhere.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  EmptyState,
  Skeleton,
} from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import type { RootStackParamList } from '../../../navigation/types';
import { KpiTile } from './KpiTile';
import {
  checkedInPct,
  flagStrips,
  isTrackedEmpty,
  kpiTiles,
} from './dashboardModel';
import { FLAG_STRIP_VISUALS, FlagStrip } from './FlagStrip';
import { FlagListSheet } from './FlagListSheet';
import { OfficeFilterSheet } from './OfficeFilterSheet';
import { DashboardHeader } from './DashboardHeader';
import { WorkspaceSelector } from './WorkspaceSelector';
import { PresentCard } from './PresentCard';
import { LoadErrorRetry } from './LoadErrorRetry';
import { useDashboardData } from './useDashboardData';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceDashboard'>;

const TILE_MARGINS = spacing.s4;
const TILE_GAP = spacing.s3;
/** KpiTile's minHeight (the tile's 158) — the loading placeholder keeps
 *  the grid's real height so the swap doesn't jump. */
const KpiTileSkeletonHeight = 158;

export default function AttendanceDashboardScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  // Two columns (the redesign's grid): floored to whole dp — the exact
  // division can round up at the pixel grid and tip the pair over,
  // re-wrapping the grid unevenly.
  const tileWidth = Math.floor((width - 2 * TILE_MARGINS - TILE_GAP) / 2);

  // Back that works from anywhere (the AttendanceHome goBackSafely idiom).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // The load/refetch engine + postures + the last-good failure seams —
  // verbatim-split into `useDashboardData` (the ≤300-line rule).
  const {
    data,
    hasSettled,
    firstLoadError,
    refetchError,
    refetching,
    manualShimmer,
    pickedOffice,
    officeCount,
    load,
    refresh,
    onPickOffice,
  } = useDashboardData();

  // The ONE fetch per appearance: the first focus IS the initial load.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // AppState-active refetch (the useCheckInOut idiom), gated to focus —
  // a foregrounding while this screen is deep in the stack is not an
  // appearance.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active' && navigation.isFocused()) void load();
    });
    return () => {
      // Some environments (jest's RN preset) return no subscription.
      sub?.remove();
    };
  }, [load, navigation]);

  // Sheets: one flag list (its kind + rows swap per strip tap) and the
  // office filter (which renders the envelope's stats and only fetches
  // offices itself when the envelope carries none).
  const [flagSheetKind, setFlagSheetKind] = useState<
    'checkoutMissing' | 'fakeLocationAttempt' | null
  >(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const tiles = data ? kpiTiles(data.counts) : [];
  const strips = data ? flagStrips(data.flags) : [];
  const showEmptyState = data !== null && isTrackedEmpty(data.counts);
  // The present-share card (the grid's sixth cell) — same number the
  // Checked-in pill shows; hidden in the tracked-empty posture.
  const presentPct = data !== null && !showEmptyState ? checkedInPct(data.counts) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <DashboardHeader
        onBack={goBackSafely}
        onRefresh={refresh}
        // EVERY in-flight fetch dims/disables it (not just the first —
        // a refetch pressed with unchanged numbers must visibly work).
        refreshing={refetching || (data === null && !hasSettled)}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* The office filter — static chrome, renders in every posture. */}
        <WorkspaceSelector
          label={pickedOffice ? pickedOffice.name : 'All offices'}
          officesCount={pickedOffice === null ? officeCount : null}
          onPress={() => setFilterSheetVisible(true)}
        />

        {(data === null && !hasSettled) || (data !== null && manualShimmer) ? (
          // Shimmer placeholders shaped as the cards they stand in for —
          // the 2×3 tile grid pulses in place (the skeleton's row pulse on
          // tile-shaped blocks, same primitive), so loading doesn't
          // collapse the layout. ALSO on an explicit Refresh press
          // (manualShimmer) — a manual pull re-shows the card shimmer.
          <View style={styles.tileGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ width: tileWidth }}>
                <Skeleton rows={1} height={KpiTileSkeletonHeight} />
              </View>
            ))}
          </View>
        ) : null}

        {data === null && firstLoadError !== null ? (
          <LoadErrorRetry onRetry={() => void load()} />
        ) : null}

        {data !== null && !manualShimmer ? (
          <>
            {!showEmptyState ? (
              <View style={styles.tileGrid}>
                {tiles.map(tile => (
                  <KpiTile
                    key={tile.key}
                    tile={tile}
                    width={tileWidth}
                  />
                ))}
                {presentPct !== null ? (
                  <PresentCard pct={presentPct} width={tileWidth} />
                ) : null}
              </View>
            ) : (
              <EmptyState
                icon={
                  <Users size={26} color={colors.status.neutral.fg} strokeWidth={1.5} />
                }
                title="No one is tracked today"
                description="Add employees to attendance to see today's summary here."
              />
            )}

            {strips.length > 0 ? (
              <View style={styles.strips}>
                {strips.map(strip => {
                  const visuals = FLAG_STRIP_VISUALS[strip.kind];
                  const Icon = visuals.icon;
                  return (
                    <FlagStrip
                      key={strip.kind}
                      icon={
                        <Icon size={20} color={colors.surfaceCard} strokeWidth={2} />
                      }
                      label={strip.label}
                      detail={strip.detail}
                      count={strip.count}
                      chip={{
                        bg: visuals.chip.bg,
                        fg: visuals.chip.fg,
                        solid: visuals.chip.solid,
                      }}
                      critical={strip.kind === 'fakeLocationAttempt'}
                      a11yLabel={strip.a11yLabel}
                      onPress={() => setFlagSheetKind(strip.kind)}
                    />
                  );
                })}
              </View>
            ) : null}

            {refetchError ? (
              // The last-good render stays above; this explains why it may
              // be stale (the InlineError contract) — BELOW the content.
              <LoadErrorRetry onRetry={() => void load()} />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <FlagListSheet
        visible={flagSheetKind !== null}
        kind={flagSheetKind}
        rows={
          data === null || flagSheetKind === null
            ? []
            : flagSheetKind === 'checkoutMissing'
              ? data.flags.checkoutMissing
              : data.flags.fakeLocationAttempt
        }
        onClose={() => setFlagSheetKind(null)}
        onRowPress={row => {
          // 19-5 D7 — the deep-link: close the sheet AND navigate in the
          // SAME tick (the native TrueSheet would otherwise float over
          // the pushed drill-down on both platforms). The drill-down
          // opens at the flag's month with the day sheet auto-opened.
          setFlagSheetKind(null);
          navigation.navigate('AttendanceEmployeeMonth', {
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            yearMonth: row.workDate.slice(0, 7),
            focusDate: row.workDate,
          });
        }}
      />
      <OfficeFilterSheet
        visible={filterSheetVisible}
        selected={pickedOffice ? pickedOffice.id : null}
        stats={data?.offices ?? null}
        onPick={office => {
          onPickOffice(office);
          setFilterSheetVisible(false);
        }}
        onClose={() => setFilterSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

/** The error + Retry composition moved to `LoadErrorRetry` (the 19-4
 *  redesign; same copy for both postures). The office filter field was
 *  restyled into `WorkspaceSelector`. */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  strips: {
    gap: spacing.s3,
  },
});
