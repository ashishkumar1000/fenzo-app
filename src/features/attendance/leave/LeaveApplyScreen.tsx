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
 */
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InlineError } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import ScreenHeader from '../offices/ScreenHeader';
import type { TechnicianRootStackParamList } from '../../../navigation/types';
import { LeaveApplyFields } from './LeaveApplyFields';
import { useLeaveApply } from './useLeaveApply';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'LeaveApply'>;

export default function LeaveApplyScreen({ navigation, route }: Props) {
  const leave = useLeaveApply({ navigation, route });

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
