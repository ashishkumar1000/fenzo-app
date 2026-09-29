/**
 * ApplyOnBehalfScreen — apply on behalf (Story 17-6, FR-16, spec D4):
 * ScreenHeader, the "Team member" section with a read-only selected
 * employee Card (Avatar + name + office + ghost "Change"), the shared
 * `LeaveApplyFields` body, and a pinned footer holding the inline-error
 * slot above the primary lg **"Approve"** — the AC's born-approved submit
 * (never "Submit for approval"). The count-chip slot holds a muted
 * one-liner instead of the technician's live preview (the preview GET is
 * technician-only; the owner JWT answers 403 — wire-truth F3), and the
 * count is discovered from the 201 view. The EmployeePickerSheet opens
 * automatically on a cold entry and re-opens from "Change".
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar, Button, InlineError, SectionHead } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { RootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../offices/ScreenHeader';
import { EmployeePickerSheet } from './EmployeePickerSheet';
import { LeaveApplyFields } from './LeaveApplyFields';
import { useApplyOnBehalf } from './useApplyOnBehalf';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplyOnBehalf'>;

const NO_PREVIEW_HINT =
  'The working-days count appears once the request is submitted.';

export default function ApplyOnBehalfScreen({ navigation, route }: Props) {
  const form = useApplyOnBehalf({ navigation, route });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Apply on behalf"
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.block}>
            <SectionHead title="Team member" />
            {form.employee ? (
              <View style={styles.employeeCard}>
                <Avatar name={form.employee.employeeName} size="md" />
                <View style={styles.employeeTexts}>
                  <Text style={styles.employeeName}>
                    {form.employee.employeeName}
                  </Text>
                  <Text style={styles.employeeOffice}>
                    {form.employee.officeName ?? 'No office'}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={form.reopenPicker}
                  style={styles.changeBtn}>
                  Change
                </Button>
              </View>
            ) : (
              <Text style={styles.pickHint}>
                Choose who this leave is for.
              </Text>
            )}
          </View>

          <LeaveApplyFields
            typeOptions={form.typeOptions}
            part={form.part}
            onChangePart={form.changePart}
            resetNote={form.resetNote}
            from={form.from}
            to={form.to}
            onOpenFromPicker={form.openFromPicker}
            onOpenToPicker={form.openToPicker}
            onClearTo={form.clearTo}
            preview={{ status: 'idle', workingDays: null, message: null }}
            countSlot={
              <Text style={styles.noPreviewHint}>{NO_PREVIEW_HINT}</Text>
            }
            showEmptyHint={false}
            reason={form.reason}
            onChangeReason={form.setReason}
          />
        </ScrollView>

        <View style={styles.footer}>
          {form.footerError ? <InlineError message={form.footerError} /> : null}
          <Button
            onPress={form.submit}
            disabled={!form.canSubmit}
            loading={form.submitting}
            size="lg"
            fullWidth>
            Approve
          </Button>
        </View>
      </KeyboardAvoidingView>

      <EmployeePickerSheet
        visible={form.pickerVisible}
        employees={form.roster}
        loading={form.rosterLoading}
        error={form.rosterError}
        onRetry={form.reloadRoster}
        onClose={() => {
          // Closing with nobody picked strands the form — go back instead.
          if (form.employee == null) navigation.goBack();
          else form.closePicker();
        }}
        onPick={form.onPickEmployee}
      />
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
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: spacing.s3,
    padding: spacing.s3,
  },
  employeeTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  employeeName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  employeeOffice: {
    ...typography.caption,
    color: colors.textMuted,
  },
  changeBtn: {
    alignSelf: 'center',
  },
  pickHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  noPreviewHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
