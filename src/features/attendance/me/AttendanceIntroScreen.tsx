/**
 * AttendanceIntroScreen — the FR-4 first-entry intro (Story 15-10), full
 * screen over the Attendance tab, per the key-onboarding-states mockup.
 *
 * Flow (spec-15-10 "Onboarding" decision): the primary CTA asks for
 * location permission FIRST, then records onboarding — permission result
 * and onboarding completion are separate facts, so the POST fires whatever
 * the permission outcome (denied never dead-ends; the summary renders in
 * full either way). "Not now" dismisses WITHOUT recording — the ask
 * reappears on the next entry; only completion records (first write wins
 * server-side, replays answer the original timestamp).
 *
 * The Android OS rationale is the shared job helper's existing message —
 * accepted as-is (AD-20: the job compat helper is unchanged).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InlineError } from '../../../components/ui';
import { colors, fontSize, radius, spacing } from '../../../theme';
import { requestLocationPermission } from '../../technicianApp/geolocation';
import { attendanceMeService } from '../../../services';
import { applyOnboardedAt, useAttendanceAccess } from './attendanceAccessStore';
import type { TechnicianRootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'AttendanceIntro'>;

const COPY = {
  headline: 'Mark attendance with a tap',
  body: 'Check in and out from your office — Fenzit checks your location, so no paperwork and no arguments about who came in.',
  privacy: 'Fenzit only reads your location the moment you check in or out — never in the background.',
  primary: 'Allow location access',
  secondary: "Not now — I'll browse without it",
};

export default function AttendanceIntroScreen({ navigation }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLatch = useRef(false);
  const { access } = useAttendanceAccess();

  // FR-3: the intro is attendance UI. If the employee's access is revoked
  // while it is open (owner disable during onboarding), leave immediately —
  // never strand a permission ask on a surface that no longer exists, and
  // never let it record onboarding (the POST is legal in any state; the UI
  // is what gates it).
  const accessState = access?.attendanceAccess ?? null;
  useEffect(() => {
    if (accessState === 'none') {
      navigation.goBack();
    }
  }, [accessState, navigation]);

  /** Primary CTA: permission ask → record onboarding → back to the tab. */
  const allowLocation = useCallback(async () => {
    if (submitLatch.current) return;
    submitLatch.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      // A thrown permission-request error records nothing — the intro
      // stays with an inline error and Retry re-requests.
      await requestLocationPermission();
      const { onboardedAt } = await attendanceMeService.recordOnboarding();
      applyOnboardedAt(onboardedAt);
      navigation.goBack();
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          'Something went wrong. Check your connection and try again.',
      );
    } finally {
      submitLatch.current = false;
      setIsSubmitting(false);
    }
  }, [navigation]);

  /** Secondary CTA: browse now, nothing recorded, intro returns next entry. */
  const notNow = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.intro}>
          <Text style={styles.headline} accessibilityRole="header">
            {COPY.headline}
          </Text>
          <Text style={styles.paragraph}>{COPY.body}</Text>
          <Text style={styles.privacy}>{COPY.privacy}</Text>
        </View>
        <View style={styles.actions}>
          {error && <InlineError message={error} />}
          <Button
            variant="primary"
            size="lg"
            onPress={() => void allowLocation()}
            loading={isSubmitting}
            disabled={isSubmitting}>
            {COPY.primary}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onPress={notNow}
            disabled={isSubmitting}>
            {COPY.secondary}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.s5,
  },
  intro: {
    gap: spacing.s4,
    marginTop: spacing.s8,
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textStrong,
  },
  paragraph: {
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * 1.5),
    color: colors.textMuted,
  },
  privacy: {
    fontSize: fontSize.xs,
    lineHeight: Math.round(fontSize.xs * 1.7),
    color: colors.textMuted,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  actions: {
    gap: spacing.s3,
  },
});
