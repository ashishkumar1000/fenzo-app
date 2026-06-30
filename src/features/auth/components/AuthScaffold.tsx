/**
 * AuthScaffold — shared shell for every account-setup step.
 *
 * Layout (top → bottom): brand mark, the 1—2—3 step indicator, then a white
 * Card holding the step's content (passed as children). Handles safe areas,
 * keyboard avoidance, and scrolling so each screen only has to describe its
 * own fields.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { TOTAL_STEPS } from '../constants';
import { BrandMark } from './BrandMark';
import { StepIndicator } from './StepIndicator';

type Props = {
  /** 1-based current step, drives the indicator. */
  step: number;
  /** Card body for this step. */
  children: ReactNode;
};

export function AuthScaffold({ step, children }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surfacePage} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <BrandMark size={64} />
          </View>

          <View style={styles.indicator}>
            <StepIndicator current={step} total={TOTAL_STEPS} />
          </View>

          <Card padding="lg" style={styles.card}>
            {children}
          </Card>
        </ScrollView>
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
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s8,
  },
  brand: {
    alignItems: 'center',
  },
  indicator: {
    marginTop: spacing.s6,
    marginBottom: spacing.s6,
  },
  card: {
    width: '100%',
  },
});
