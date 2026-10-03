/**
 * HolidaysScreen — tenant holiday list (Story 15-6, FR-20).
 *
 * Upcoming / Past grouped client-side on `date >= today` (the BE response
 * is ascending). A "+" FAB at the bottom-right opens the add sheet; a
 * row tap opens the edit sheet (past rows are still tappable — FR-20
 * allows past edits/removals).
 *
 * Today source: `useIstToday()` — the IST calendar day, never the device's
 * own local date, and kept live for as long as the screen is mounted so a
 * screen left open across IST midnight re-files a holiday that has just
 * become past instead of leaving it under "Upcoming". The server groups day
 * statuses against its own per-tenant "today" (`attendance_today`, AD-7) and
 * no endpoint hands that date to the FE, so the FE mirrors it on the
 * product's home timezone: a device set elsewhere must not put a holiday in a
 * section the BE disagrees with.
 *
 * Delete is destructive-confirm (the shared ConfirmDialog, danger variant),
 * matching the destructive pattern from OfficeFormScreen's archive.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  Eyebrow,
  IconButton,
  InlineError,
  InlineNotice,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing } from '../../../theme';
import type { Holiday } from '../../../services';
import { useFlashMessage, useIstToday } from '../../../hooks';
import ScreenHeader from '../offices/ScreenHeader';
import HolidayRow from './HolidayRow';
import HolidayFormSheet from './HolidayFormSheet';
import { useHolidays } from './useHolidays';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceHolidays'>;

export default function HolidaysScreen({ navigation }: Props) {
  const today = useIstToday();
  const {
    holidays,
    isLoading,
    hasLoaded,
    error,
    refresh,
    create,
    update,
    remove,
    impact,
    isSaving,
    saveError,
    clearSaveError,
  } = useHolidays();

  const [openSheet, setOpenSheetState] = useState<
    | { kind: 'edit'; holiday: Holiday }
    | { kind: 'add' }
    | null
  >(null);
  const success = useFlashMessage();

  /**
   * Every open path drops a held saveError FIRST (15-6 review iteration 1):
   * the sheet is conditionally mounted, so a saveError left over from a
   * previous open would otherwise render in — and re-key its 409 onto — the
   * freshly reopened form, re-bricking the surface the earlier fix unbricked.
   */
  const setOpenSheet = useCallback(
    (next: { kind: 'edit'; holiday: Holiday } | { kind: 'add' } | null) => {
      if (next) clearSaveError();
      setOpenSheetState(next);
    },
    [clearSaveError],
  );
  // Pull-to-refresh (15-6 review iteration 1, user decision) — the spinner
  // tracks the refetch, which now resolves on completion.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);

  // Back that works from anywhere: when this screen is the only route on
  // the stack (deep link), `goBack` would strand the user — reset to the
  // tabs (the JobDetailScreen pattern).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const { upcoming, past } = useMemo(() => {
    const up: Holiday[] = [];
    const pa: Holiday[] = [];
    for (const h of holidays) {
      if (h.date >= today) up.push(h);
      else pa.push(h);
    }
    // Past reads newest-first — recent history at the top — while the BE
    // list is ascending and Upcoming keeps that natural order.
    return { upcoming: up, past: pa.slice().reverse() };
  }, [holidays, today]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Holidays" onBack={goBackSafely} />

      <View style={styles.body}>
        {success.message ? (
          <View style={styles.bannerWrap}>
            <InlineNotice
              tone="success"
              message={success.message}
              onDismiss={success.dismiss}
            />
          </View>
        ) : null}

        {error && hasLoaded ? (
          <View style={styles.bannerWrap}>
            <InlineError message="Couldn't refresh holidays. Showing the last loaded list." />
            {/* The list on screen is stale — offer the re-fetch right here
                instead of forcing a leave-and-return to recover. */}
            <Button variant="secondary" size="sm" onPress={refresh}>
              Retry
            </Button>
          </View>
        ) : null}

        {isLoading && !hasLoaded ? (
          // First load: a list-shaped shimmer, labelled (the 19-5 idiom).
          <View style={styles.skeleton} accessibilityLabel="Loading attendance">
            <Skeleton rows={4} height={48} />
          </View>
        ) : error && !hasLoaded ? (
          <View style={styles.content}>
            <InlineError message="Couldn't load holidays. Check your connection and try again." />
            <Button variant="secondary" onPress={refresh}>
              Retry
            </Button>
          </View>
        ) : holidays.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={<Plus size={24} color={colors.primary} strokeWidth={1.5} />}
              title="No holidays yet"
              description="Add company holidays so attendance marks these days off for everyone."
              ctaLabel="Add holiday"
              ctaIcon={
                <Plus size={16} color={colors.onPrimary} strokeWidth={2} />
              }
              onPressCta={() => setOpenSheet({ kind: 'add' })}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }>
            {upcoming.length > 0 ? (
              <>
                <Eyebrow style={styles.sectionSpacing}>Upcoming</Eyebrow>
                {upcoming.map((h) => (
                  <HolidayRow
                    key={h.id}
                    holiday={h}
                    today={today}
                    onPress={() => setOpenSheet({ kind: 'edit', holiday: h })}
                  />
                ))}
              </>
            ) : null}

            {past.length > 0 ? (
              <>
                <Eyebrow style={styles.sectionSpacing}>Past</Eyebrow>
                {past.map((h) => (
                  <HolidayRow
                    key={h.id}
                    holiday={h}
                    today={today}
                    onPress={() => setOpenSheet({ kind: 'edit', holiday: h })}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
        )}

        {holidays.length > 0 ? (
          <View style={styles.fab} pointerEvents="box-none">
            <IconButton
              variant="solid"
              size="lg"
              label="Add holiday"
              onPress={() => setOpenSheet({ kind: 'add' })}
              style={styles.fabButton}>
              <Plus size={22} color={colors.onPrimary} strokeWidth={2} />
            </IconButton>
          </View>
        ) : null}
      </View>

      {openSheet ? (
        <HolidayFormSheet
          visible
          // Closing is NOT success — the sheet reports a write through
          // `onSaved` (Close button, drag-down and back all land here too).
          onClose={() => setOpenSheet(null)}
          onSaved={(kind) => {
            success.flash(
              kind === 'delete'
                ? 'Holiday removed'
                : openSheet.kind === 'add'
                ? 'Holiday added'
                : 'Holiday updated',
            );
          }}
          today={today}
          holiday={openSheet.kind === 'edit' ? openSheet.holiday : undefined}
          create={create}
          update={update}
          remove={remove}
          impact={impact}
          isSaving={isSaving}
          saveError={saveError}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  body: {
    flex: 1,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s2,
  },
  skeleton: {
    padding: spacing.s4,
  },
  empty: {
    flex: 1,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
    // The FAB is absolutely positioned over the list — pad the last row
    // clear of it (FAB bottom inset + its 52px height + breathing room).
    paddingBottom: spacing.s12 + spacing.s8,
  },
  // The DS `Eyebrow` owns the type and the caps; this only positions it
  // (the same breathing room the hand-rolled label used to carry).
  sectionSpacing: {
    marginTop: spacing.s2,
  },
  fab: {
    position: 'absolute',
    right: spacing.s5,
    bottom: spacing.s5,
  },
  fabButton: {
    borderRadius: radius.pill,
  },
});
