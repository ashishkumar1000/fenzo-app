/**
 * WeeklyOffScreen — tenant-default weekly off + per-employee overrides
 * (Story 15-6, FR-18/FR-19). Two sections on one page:
 *
 *  1. Tenant default — 7 day pills + effective-date field + Save. Sunday
 *     is visually preselected on first open (when no default row exists)
 *     but `isDirty` starts false; Save is disabled until the user diverges.
 *  2. Employee-wise weekly off — the override list + "Set weekly off". A tap
 *     opens a Sheet with the same pills + a destructive Remove weekly off.
 *
 * This file owns the layout and the section wiring. The default block's
 * state and gating rules live in `useWeeklyOffDefaultForm.ts`, the override
 * sheet wiring in `useOverrideSheet.ts`, the section components in
 * `WeeklyOffDefaultSection.tsx` / `WeeklyOffOverridesSection.tsx`, and the
 * pure helpers in `weeklyOffModel.ts`.
 *
 * Today source: `useIstToday()` — the IST calendar day, never the device's
 * own local date, and kept live while the screen is mounted so the
 * effective-date floor and the "upcoming changes" cut-off advance if the day
 * rolls over while the screen is open. The server computes its "today" per
 * tenant in the tenant timezone (`attendance_today`, AD-7) and no endpoint
 * hands that date to the FE, so the FE mirrors it on the product's home
 * timezone. It is the effective-date floor here; the BE still clamps silently
 * per AD-8.
 */
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InlineError, InlineNotice, Skeleton } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { useFlashMessage, useIstToday } from '../../../hooks';
import ScreenHeader from '../offices/ScreenHeader';
import { useWeeklyOffs } from './useWeeklyOffs';
import { useWeeklyOffOverrides } from './useWeeklyOffOverrides';
import { useWeeklyOffDefaultForm } from './useWeeklyOffDefaultForm';
import { WeeklyOffDefaultSection } from './WeeklyOffDefaultSection';
import { WeeklyOffOverridesSection } from './WeeklyOffOverridesSection';
import WeeklyOffOverrideSheet from './WeeklyOffOverrideSheet';
import { useOverrideSheet } from './useOverrideSheet';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceWeeklyOff'>;

export default function WeeklyOffScreen({ navigation, route }: Props) {
  const today = useIstToday();
  const {
    defaultView,
    nextView,
    history,
    isLoading,
    hasLoaded,
    error,
    refresh,
    saveDefault,
    saveError,
    isSaving,
  } = useWeeklyOffs();
  const {
    overrides,
    isLoading: isLoadingOverrides,
    hasLoaded: hasLoadedOverrides,
    error: overridesError,
    refresh: refreshOverrides,
    saveOverride,
    removeOverride,
    clearSaveError: clearOverrideSaveError,
    isSaving: isSavingOverride,
    saveError: saveErrorOverride,
  } = useWeeklyOffOverrides();

  const success = useFlashMessage();

  const defaultForm = useWeeklyOffDefaultForm({
    defaultView,
    nextView,
    history,
    hasLoaded,
    isSaving,
    today,
    saveDefault,
    onSaved: success.flash,
  });

  // Pull-to-refresh (15-6 review iteration 1, user decision) — the spinner
  // tracks the refetch, which resolves on completion.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshOverrides()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshOverrides, refreshing]);

  // --- Override sheet wiring ---
  // Every open path (Add CTA, Edit tap, picker round-trip) drops a held
  // saveError first — the sheet is conditionally mounted, so a stale error
  // from a previous open would otherwise render in, and re-key its 409
  // onto, the freshly reopened form (15-6 review iteration 1).
  const openOverrideSheet = useCallback(() => {
    clearOverrideSaveError();
  }, [clearOverrideSaveError]);
  const {
    openSheetFor,
    closeSheet,
    employees,
    addDisabledReason,
    openAddOverride,
    openEditOverride,
    onPickEmployee,
  } = useOverrideSheet({
    navigation,
    route,
    onOpen: openOverrideSheet,
  });

  // Back that works from anywhere: when this screen is the only route on
  // the stack (a 15-8 wizard deep link), `goBack` would strand the user —
  // reset to the tabs (the HolidaysScreen / JobDetailScreen pattern).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Weekly off" onBack={goBackSafely} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {success.message ? (
          <InlineNotice
            tone="success"
            message={success.message}
            onDismiss={success.dismiss}
          />
        ) : null}

        {error && hasLoaded ? (
          <View style={styles.staleError}>
            <InlineError message="Couldn't refresh weekly off. Showing the last loaded selection." />
            {/* The shown selection is stale — offer the re-fetch right here
                instead of forcing a leave-and-return to recover (the same
                affordance the holidays list carries; 15-6 review
                iteration 1). */}
            <Button variant="secondary" size="sm" onPress={refresh}>
              Retry
            </Button>
          </View>
        ) : null}

        {/* The default block's fetch failure is ITS OWN state (15-6 review
            P10): the overrides list below fetches independently and stays
            rendered, so one failed GET must not blank the whole screen. */}
        {isLoading && !hasLoaded ? (
          // First load: a block-shaped shimmer, labelled (the 19-5 idiom).
          <View style={styles.skeleton} accessibilityLabel="Loading attendance">
            <Skeleton rows={4} height={48} />
          </View>
        ) : error && !hasLoaded ? (
          <View style={styles.contentInner}>
            <InlineError message="Couldn't load weekly off. Check your connection and try again." />
            <Button variant="secondary" onPress={refresh}>
              Retry
            </Button>
          </View>
        ) : (
          <WeeklyOffDefaultSection
            neverConfigured={defaultForm.neverConfigured}
            selectedDays={defaultForm.selectedDays}
            onDayToggle={defaultForm.onDayToggle}
            isSaving={isSaving}
            sevenSelected={defaultForm.sevenSelected}
            noWorkingDays={defaultForm.noWorkingDays}
            effectiveFrom={defaultForm.effectiveFrom}
            onEffectiveFromChange={defaultForm.onEffectiveFromChange}
            today={today}
            saveError={saveError}
            saveDisabled={defaultForm.saveDisabled}
            onSave={defaultForm.onSave}
            upcoming={defaultForm.upcoming}
          />
        )}

        <WeeklyOffOverridesSection
          overrides={overrides}
          isLoading={isLoadingOverrides}
          hasLoaded={hasLoadedOverrides}
          error={overridesError}
          onRetry={refreshOverrides}
          addDisabled={employees.length === 0}
          addDisabledReason={addDisabledReason}
          onAdd={openAddOverride}
          onEdit={openEditOverride}
        />
      </ScrollView>

      {openSheetFor ? (
        <WeeklyOffOverrideSheet
          visible
          onClose={closeSheet}
          // Closing is NOT success — the sheet reports a write through
          // `onSaved` (Close button, drag-down and back land here too).
          onSaved={(kind) =>
            success.flash(kind === 'delete' ? 'Employee weekly off removed' : 'Employee weekly off saved')
          }
          today={today}
          employees={employees}
          override={
            openSheetFor.kind === 'edit' ? openSheetFor.override : undefined
          }
          pickedEmployee={
            openSheetFor.kind === 'add' ? openSheetFor.picked : undefined
          }
          onPickEmployee={onPickEmployee}
          saveOverride={saveOverride}
          removeOverride={removeOverride}
          isSaving={isSavingOverride}
          saveError={saveErrorOverride}
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
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  contentInner: {
    gap: spacing.s3,
  },
  staleError: {
    gap: spacing.s3,
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
});
