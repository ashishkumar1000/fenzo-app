/**
 * LeaveApplyScreen — the technician's self-apply leave form (Story 17-5,
 * mockup Frame A). Composition per spec D2: header → scrollable Type /
 * Dates / Reason blocks → a pinned footer (the DatePickerScreen idiom)
 * holding the inline-error slot above the submit button. The date rows
 * (LeaveDateRow — the DatePickerField anatomy clone) push the full-screen
 * DatePickerScreen, which returns via the pickedDate/context channel the
 * hook consumes.
 *
 * 17-6: the Type/Dates/Reason body is the extracted `LeaveApplyFields`
 * (spec D4 — the on-behalf screen shares it); this screen passes the
 * hook's state through unchanged and renders identically (its tests pin
 * the anatomy).
 *
 * The FE renders, never computes (NFR-2): the working-days count is the
 * server's integer verbatim; every rejection is the server's message
 * verbatim, inline, and the submit button stays enabled (D4/D6).
 *
 * 2026-10 redesign: the mock's header ⓘ opens the employee's OWN policy
 * sheet — the same "Shift & location policy" facts the tab card carries
 * (Office / Timings / Late cut-off / Weekly offs, via the shared
 * `buildPolicyRows`), fetched once by attendanceMeService.getSummary() at
 * the sheet's first open (no summary exists on this screen's route and a
 * fresh GET is the only wire truth). The mock's leave-balance availability
 * card and attachment block are deliberately NOT built — the wire carries
 * no balances and no attachment field (the render-never-invent rule).
 */
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Info } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  IconButton,
  InlineError,
  Sheet,
  Skeleton,
} from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { attendanceMeService } from '../../../services';
import type { AttendanceSummary } from '../../../services';
import ScreenHeader from '../offices/ScreenHeader';
import { AttendanceSummaryView } from '../me/AttendanceSummaryView';
import type { TechnicianRootStackParamList } from '../../../navigation/types';
import { LeaveApplyFields } from './LeaveApplyFields';
import { useLeaveApply } from './useLeaveApply';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'LeaveApply'>;

export default function LeaveApplyScreen({ navigation, route }: Props) {
  const leave = useLeaveApply({ navigation, route });

  // The policy sheet's one-shot fetch (lazy — the first ⓘ open pays the
  // GET; retries re-fetch; a failed refetch over loaded rows keeps them).
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policySummary, setPolicySummary] = useState<AttendanceSummary | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const policyLoaded = useRef(false);
  const policyInFlight = useRef(false);

  const openPolicy = useCallback(() => {
    setPolicyOpen(true);
    if (policyLoaded.current || policyInFlight.current) return;
    policyInFlight.current = true;
    setPolicyLoading(true);
    attendanceMeService
      .getSummary()
      .then(summary => {
        policyLoaded.current = true;
        setPolicySummary(summary);
        setPolicyError(null);
      })
      .catch((err: { message?: string }) => {
        setPolicyError(err?.message ?? 'Could not load your policy details. Check your connection and try again.');
      })
      .finally(() => {
        policyInFlight.current = false;
        setPolicyLoading(false);
      });
  }, []);

  const retryPolicy = useCallback(() => {
    policyLoaded.current = false;
    openPolicy();
  }, [openPolicy]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Apply for leave"
        onBack={() => navigation.goBack()}
        right={
          <IconButton
            variant="ghost"
            size="md"
            label="View leave policy"
            onPress={openPolicy}>
            <Info size={20} color={colors.textBody} strokeWidth={2} />
          </IconButton>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <LeaveApplyFields
            typeOptions={leave.typeOptions}
            part={leave.part}
            onChangePart={leave.changePart}
            resetNote={leave.resetNote}
            from={leave.from}
            to={leave.to}
            onOpenFromPicker={leave.openFromPicker}
            onOpenToPicker={leave.openToPicker}
            onClearTo={leave.clearTo}
            preview={leave.preview}
            showEmptyHint={!leave.from}
            reason={leave.reason}
            onChangeReason={leave.setReason}
          />
        </ScrollView>

        <View style={styles.footer}>
          {leave.footerError ? <InlineError message={leave.footerError} /> : null}
          <Button
            onPress={leave.submit}
            disabled={!leave.canSubmit}
            loading={leave.submitting}
            size="lg"
            fullWidth>
            Submit for approval
          </Button>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title="Shift & location policy"
        detents={['auto']}>
        <AttendanceSummaryView
          embedded
          state={{
            summary: policySummary,
            isLoading: policyLoading,
            error: policyError,
            isStale: false,
          }}
          onRetry={retryPolicy}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  footer: {
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
