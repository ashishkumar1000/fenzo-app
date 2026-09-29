/**
 * LeaveApplyScreen — the technician's self-apply leave form (Story 17-5,
 * mockup Frame A). Composition per spec D2: header → scrollable Type /
 * Dates / Reason blocks → a pinned footer (the DatePickerScreen idiom)
 * holding the inline-error slot above the submit button. The date rows
 * (LeaveDateRow — the DatePickerField anatomy clone) push the full-screen
 * DatePickerScreen, which returns via the pickedDate/context channel the
 * hook consumes.
 *
 * The FE renders, never computes (NFR-2): the working-days count is the
 * server's integer verbatim; every rejection is the server's message
 * verbatim, inline, and the submit button stays enabled (D4/D6).
 */
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  Eyebrow,
  InlineError,
  InlineNotice,
  Input,
  SectionHead,
  SegmentedControl,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import ScreenHeader from '../offices/ScreenHeader';
import type { TechnicianRootStackParamList } from '../../../navigation/types';
import { LeaveDateRow } from './LeaveDateRow';
import { workingDaysCopy } from './leaveApplyModel';
import { useLeaveApply } from './useLeaveApply';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'LeaveApply'>;

const RESET_NOTE_MESSAGE =
  'Leave type reset to Full day — half day applies to a single date only.';
const EMPTY_COUNT_HINT = 'Pick dates to see the working-days count.';
const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;

export default function LeaveApplyScreen({ navigation, route }: Props) {
  const leave = useLeaveApply({ navigation, route });
  const { preview, from } = leave;
  const showChip =
    preview.status === 'ok' ||
    (preview.status === 'loading' && preview.workingDays != null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Apply for leave" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.block}>
            <Eyebrow>Type</Eyebrow>
            <SegmentedControl
              options={leave.typeOptions}
              value={leave.part}
              onChange={leave.changePart}
            />
            {leave.resetNote ? (
              <InlineNotice message={RESET_NOTE_MESSAGE} tone="neutral" icon={null} />
            ) : null}
          </View>

          <View style={styles.block}>
            <SectionHead title="Dates" />
            <View style={styles.rows}>
              <LeaveDateRow
                label="From"
                value={leave.from}
                onPress={leave.openFromPicker}
              />
              <LeaveDateRow
                label="To"
                value={leave.to}
                placeholder="Optional"
                onPress={leave.openToPicker}
                disabled={!leave.from}
                onClear={leave.to ? leave.clearTo : undefined}
              />
              {showChip ? (
                <View
                  style={[
                    styles.countChip,
                    preview.status === 'loading' ? styles.countDim : null,
                  ]}
                  accessibilityLiveRegion="polite">
                  <CalendarDays
                    size={16}
                    color={colors.status.progress.fg}
                    strokeWidth={2}
                  />
                  <Text style={styles.countText}>
                    {preview.workingDays != null
                      ? workingDaysCopy(preview.workingDays)
                      : null}
                  </Text>
                </View>
              ) : preview.status === 'rejected' ? (
                <InlineNotice message={preview.message ?? ''} tone="info" />
              ) : preview.status === 'transport' ? (
                <InlineNotice message={preview.message ?? ''} tone="neutral" />
              ) : !from ? (
                <Text style={styles.countHint}>{EMPTY_COUNT_HINT}</Text>
              ) : null}
              {/* With From set but no value yet (first GET in flight) the
                  area stays empty — the "Pick dates" hint is only for the
                  genuinely empty state (review: contract-hunter LOW). */}
            </View>
          </View>

          <View style={styles.block}>
            <SectionHead title="Reason (required)" />
            <View style={styles.reasonField}>
              <Input
                value={leave.reason}
                onChangeText={leave.setReason}
                placeholder="Why do you need leave?"
                multiline
                maxLength={REASON_MAX}
                accessibilityLabel="Reason (required)"
              />
              <Text
                style={[
                  styles.counter,
                  leave.reason.length >= REASON_NEAR_LIMIT
                    ? styles.counterNearLimit
                    : null,
                ]}>
                {leave.reason.length} / {REASON_MAX}
              </Text>
            </View>
          </View>
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
  block: {
    gap: spacing.s2,
  },
  rows: {
    gap: spacing.s3,
  },
  reasonField: {
    gap: spacing.s1,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.status.progress.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  countDim: {
    opacity: 0.6,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.status.progress.fg,
  },
  countHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  counterNearLimit: {
    color: colors.status.scheduled.fg,
  },
  footer: {
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
