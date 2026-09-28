/**
 * WizardStepFrame — the chrome every setup-wizard step renders inside
 * (Story 15-8): the back control, the step title + one-line description,
 * the auth `StepIndicator` (its shipped "Step X of Y" accessible labelling
 * preserved verbatim), an optional banner slot above the body, and the
 * pinned footer the screen composes its Continue/Skip/Enable controls
 * into.
 *
 * Purely presentational — the machine lives in `SetupWizardScreen` (the
 * AuthFlow pattern: steps are component state, not navigator routes, so
 * every step renders through this one frame).
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { StepIndicator } from '../../auth/components/StepIndicator';

type Props = {
  /** 1-based — feeds StepIndicator's `current` unchanged. */
  stepNumber: number;
  total: number;
  title: string;
  description: string;
  /** The back control's accessible name — "Previous step" on steps 2+,
   *  an exit label on step 1 (the two behaviors differ). */
  backLabel: string;
  onBack: () => void;
  /** Retry banners etc., rendered between the indicator and the body. */
  banner?: ReactNode;
  /** Pinned above the bottom edge — buttons + the gate caption. */
  footer: ReactNode;
  children: ReactNode;
};

export function WizardStepFrame({
  stepNumber,
  total,
  title,
  description,
  backLabel,
  onBack,
  banner,
  footer,
  children,
}: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <IconButton variant="ghost" size="md" label={backLabel} onPress={onBack}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>

      <View style={styles.indicatorWrap}>
        <StepIndicator current={stepNumber} total={total} />
      </View>

      {banner}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingRight: spacing.s4,
    paddingBottom: spacing.s2,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  description: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  indicatorWrap: {
    alignItems: 'center',
    paddingVertical: spacing.s4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  scroll: {
    flex: 1,
  },
  body: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    gap: spacing.s2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
  },
});
