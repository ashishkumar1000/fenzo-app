/**
 * SetupWizardScreen — the 15-8 first-run attendance setup wizard.
 *
 * An AuthFlow-style component state machine (steps are component state,
 * never navigator routes): the fixed five-step vocabulary walks via
 * `useSetupWizard`'s server-authoritative marker. Steps 1–4 render
 * server-truth SUMMARIES and push the shipped routes (AttendanceOffices /
 * OfficeForm / AttendanceWeeklyOff / AttendanceHolidays) for all editing —
 * those screens own their own loading/error/save handling; the wizard owns
 * progress only. Step 5 is the enrolment-lite Employees step.
 *
 * All step data is fetched here (the hooks' focus-refetch refreshes the
 * summaries every time a pushed screen pops) so the per-step Continue gate
 * and the final "Enable attendance" gate are computed from one snapshot.
 * Exit paths ALL land on `AttendanceHome` via replace: completion, an
 * already-completed bounce, and another device finishing mid-wizard — the
 * gate lives only in AttendanceHome, so there is no redirect loop.
 *
 * In-session Back steps backward (the marker never moves backward — it
 * only advances on Continue/Skip); device back pops the route and the next
 * entry resumes at the marker via goBackSafely semantics.
 */
import { useCallback, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InlineError } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { useIstToday } from '../../../hooks';
import type { RootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../offices/ScreenHeader';
import { useOffices } from '../offices/useOffices';
import { useWeeklyOffs } from '../settings/useWeeklyOffs';
import { useHolidays } from '../settings/useHolidays';
import {
  SETUP_STEPS,
  STEP_DESCRIPTIONS,
  STEP_TITLES,
  continueGateReason,
  completionGateReason,
  nextStep,
  stepIndex,
  stepNumber,
} from './wizardModel';
import type { StepGateSnapshot } from './wizardModel';
import { useSetupWizard } from './useSetupWizard';
import { useEnrolments } from '../enrolments/useEnrolments';
import { WizardStepFrame } from './WizardStepFrame';
import { WizardFooter } from './WizardFooter';
import { WizardBanners } from './WizardBanners';
import { OfficesStep } from './OfficesStep';
import { TimingsStep } from './TimingsStep';
import { WeeklyOffStep } from './WeeklyOffStep';
import { HolidaysStep } from './HolidaysStep';
import { EmployeesStep } from './EmployeesStep';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceSetupWizard'>;

export default function SetupWizardScreen({ navigation }: Props) {
  const today = useIstToday();

  // The step-data surfaces (tri-state + focus-refetch per the useOffices
  // contract). An office archived out from under a picker PUT refreshes
  // the office list so the picker stops offering it.
  const offices = useOffices();
  const weeklyOffs = useWeeklyOffs();
  const holidays = useHolidays();
  const roster = useEnrolments({ today, onOfficeArchived: offices.refresh });

  // A 422 ATTENDANCE_SETUP_INCOMPLETE means the server's gates saw less
  // than the client mirror did — refetch both sides of the gate.
  const refetchGateData = useCallback(() => {
    offices.refresh();
    void roster.refresh();
  }, [offices.refresh, roster.refresh]);

  const wizard = useSetupWizard({ onSetupIncomplete: refetchGateData });

  // Back that works from anywhere: the wizard route REPLACED AttendanceHome,
  // so step-1 back / device back pops to whatever sat beneath it (or the
  // tabs for a deep link) — server progress persists and resume lands on
  // the marker step.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // Every exit lands on AttendanceHome via replace — the wizard sits where
  // AttendanceHome was, and the gate runs only THERE (no redirect loop).
  useEffect(() => {
    if (wizard.exitReason) {
      navigation.replace('AttendanceHome');
    }
  }, [wizard.exitReason, navigation]);

  const live = offices.activeOffices; // archivedAt === null — the live set
  const stepSnapshot: StepGateSnapshot = {
    liveOfficeCount: live.length,
    liveOfficesMissingRule: live.filter((office) => !office.rule).length,
    // A saved EMPTY default (days: [], the works-all-week rule) is a real
    // saved view — only `defaultView === null` gates Continue.
    weeklyOffDefaultDays:
      weeklyOffs.defaultView === null ? null : weeklyOffs.defaultView.days,
  };

  // --- Bootstrap loading / error / exit chrome --------------------------
  // ORDER MATTERS: a failed bootstrap leaves `currentStep` null forever, so
  // the error branch must sit before the `!currentStep` loading check or
  // every bootstrap failure (network down, a technician's 403) renders an
  // infinite spinner instead of the retry state.
  if (wizard.exitReason) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Attendance setup" onBack={goBackSafely} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (wizard.bootstrapError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Attendance setup" onBack={goBackSafely} />
        <View style={styles.centerContent}>
          <InlineError
            message={
              wizard.bootstrapError.status === 403
                ? "You don't have permission to set up attendance."
                : "Couldn't load your setup. Check your connection and try again."
            }
          />
          <Button variant="secondary" onPress={wizard.retryBootstrap}>
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (wizard.isLoading || !wizard.currentStep) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Attendance setup" onBack={goBackSafely} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const step = wizard.currentStep;
  const gateReason = continueGateReason(step, stepSnapshot);
  const completionReason = completionGateReason({
    offices: offices.offices,
    roster: roster.roster,
    today,
  });
  const isFinalStep = nextStep(step) === null;
  const inSession = stepIndex(step) > 0;

  // The caption stays hidden until the step's GATE surfaces have loaded: a
  // snapshot of empty defaults would flash a self-contradicting caption
  // ("Save your default weekly off first.") while its GET is still in
  // flight. The primary stays disabled either way — empty defaults never
  // satisfy a gate. (Mirrors WizardBanners' step→surface split; holidays
  // has no gate, hence no loaded requirement.)
  const gateLoaded =
    step === 'offices' || step === 'timings'
      ? offices.hasLoaded
      : step === 'weekly_off'
        ? weeklyOffs.hasLoaded
        : step === 'employees'
          ? offices.hasLoaded && roster.hasLoaded
          : true;
  const caption = gateLoaded
    ? isFinalStep
      ? completionReason
      : gateReason
    : null;

  // --- Banners (marker-PATCH retry, completion failure, stale refetches) -
  const banners = (
    <WizardBanners
      step={step}
      advanceError={wizard.advanceError}
      onRetryAdvance={wizard.advance}
      isAdvancing={wizard.isAdvancing}
      completionError={wizard.completionError}
      surfaces={{
        offices: {
          hasError: offices.error !== null,
          hasLoaded: offices.hasLoaded,
          message: "Couldn't refresh offices. Showing the last loaded list.",
        },
        weeklyOff: {
          hasError: weeklyOffs.error !== null,
          hasLoaded: weeklyOffs.hasLoaded,
          message: 'Couldn\u2019t refresh your weekly off. Showing the last loaded selection.',
        },
        holidays: {
          hasError: holidays.error !== null,
          hasLoaded: holidays.hasLoaded,
          message: "Couldn't refresh holidays. Showing the last loaded list.",
        },
        roster: {
          hasError: roster.error !== null,
          hasLoaded: roster.hasLoaded,
          message: "Couldn't refresh your team. Showing the last loaded list.",
        },
      }}
    />
  );

  // --- Step bodies (summaries only — editing is delegated) ---------------
  let body: ReactNode;
  if (step === 'offices') {
    body = (
      <OfficesStep
        offices={live}
        isLoading={offices.isLoading}
        hasLoaded={offices.hasLoaded}
        error={offices.error}
        onRetry={offices.refresh}
        onManageOffices={() => navigation.navigate('AttendanceOffices')}
      />
    );
  } else if (step === 'timings') {
    body = (
      <TimingsStep
        offices={live}
        isLoading={offices.isLoading}
        hasLoaded={offices.hasLoaded}
        error={offices.error}
        onRetry={offices.refresh}
        onEditOffice={(officeId) => navigation.navigate('OfficeForm', { officeId })}
        onAddOffice={() => navigation.navigate('OfficeForm', undefined)}
      />
    );
  } else if (step === 'weekly_off') {
    body = (
      <WeeklyOffStep
        defaultDays={weeklyOffs.defaultView?.days ?? null}
        isLoading={weeklyOffs.isLoading}
        hasLoaded={weeklyOffs.hasLoaded}
        error={weeklyOffs.error}
        onRetry={weeklyOffs.refresh}
        onManageWeeklyOff={() => navigation.navigate('AttendanceWeeklyOff', undefined)}
      />
    );
  } else if (step === 'holidays') {
    body = (
      <HolidaysStep
        holidays={holidays.holidays}
        today={today}
        isLoading={holidays.isLoading}
        hasLoaded={holidays.hasLoaded}
        error={holidays.error}
        onRetry={holidays.refresh}
        onManageHolidays={() => navigation.navigate('AttendanceHolidays', undefined)}
      />
    );
  } else {
    body = (
      <EmployeesStep
        roster={roster.roster}
        liveOffices={live}
        today={today}
        isLoading={roster.isLoading}
        hasLoaded={roster.hasLoaded}
        error={roster.error}
        onRetry={roster.refresh}
        rowError={roster.rowError}
        isRowPending={roster.isRowPending}
        onEnable={roster.enable}
        onDisable={roster.disable}
      />
    );
  }

  return (
    <WizardStepFrame
      stepNumber={stepNumber(step)}
      total={SETUP_STEPS.length}
      title={STEP_TITLES[step]}
      description={STEP_DESCRIPTIONS[step]}
      backLabel={inSession ? 'Previous step' : 'Exit setup'}
      onBack={inSession ? wizard.back : goBackSafely}
      banner={banners}
      footer={
        <WizardFooter
          primaryLabel={isFinalStep ? 'Enable attendance' : 'Continue'}
          onPrimary={isFinalStep ? wizard.complete : wizard.advance}
          primaryDisabled={isFinalStep ? completionReason !== null : gateReason !== null}
          primaryLoading={isFinalStep ? wizard.isCompleting : wizard.isAdvancing}
          caption={caption}
          secondaryLabel={step === 'holidays' ? 'Skip for now' : undefined}
          onSecondary={step === 'holidays' ? wizard.advance : undefined}
        />
      }>
      {body}
    </WizardStepFrame>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
});
