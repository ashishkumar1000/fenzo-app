/**
 * NewJobScreen — full-screen route (pushed over the tabs) for creating a job.
 *
 * A page rather than a bottom sheet on purpose: the form already has five
 * sections and will grow (address, parts, estimate), and a sheet that tall
 * fights the keyboard on small phones.
 *
 * ⚠️ Sample state only. Options come from `data.ts` constants and "Create job"
 * doesn't persist anything yet — see the TODOs below for the three wiring
 * points. The form state and validation here are real, so swapping the data
 * sources shouldn't need this file restructured.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, UserPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Select } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { DateTimeFields } from './components/DateTimeFields';
import { ServiceTypePicker } from './components/ServiceTypePicker';
import { TechnicianPicker } from './components/TechnicianPicker';
import { CUSTOMERS, SERVICE_TYPES, TECHNICIANS } from './data';
import type { NewJobDraft } from './types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewJob'>;

/** Default slot: today's date, so the picker opens somewhere sensible. */
const initialDraft = (): NewJobDraft => ({
  serviceTypeId: null,
  customerId: null,
  scheduledAt: new Date(),
  technicianId: null,
  notes: '',
});

export default function NewJobScreen({ navigation }: Props) {
  const [draft, setDraft] = useState<NewJobDraft>(initialDraft);

  const patch = (changes: Partial<NewJobDraft>) =>
    setDraft(current => ({ ...current, ...changes }));

  // A technician is deliberately not required — an owner often books the slot
  // first and assigns it later. Service type and customer are the minimum that
  // makes a job meaningful.
  const canSubmit = Boolean(draft.serviceTypeId) && Boolean(draft.customerId);

  const handleSubmit = () => {
    if (!canSubmit) return;
    // TODO(jobService): POST the draft, then navigate to the new job's detail
    // screen instead of going back.
    navigation.goBack();
  };

  const handleAddCustomer = () => {
    // TODO(customers): open the "Add customer" flow, then preselect the new
    // customer here on return.
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>New job</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Service type</Text>
            <ServiceTypePicker
              options={SERVICE_TYPES}
              value={draft.serviceTypeId}
              onChange={id => patch({ serviceTypeId: id })}
            />
          </View>

          <View style={styles.section}>
            <Select
              label="Customer"
              value={draft.customerId ?? undefined}
              onChange={id => patch({ customerId: id })}
              options={CUSTOMERS.map(c => ({ value: c.id, label: c.name }))}
              placeholder="Choose customer..."
            />
            <Pressable
              onPress={handleAddCustomer}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.addCustomerRow}>
              <UserPlus size={18} color={colors.textLink} strokeWidth={2} />
              <Text style={styles.addCustomerText}>
                Customer not in list? Add new
              </Text>
            </Pressable>
          </View>

          <DateTimeFields
            value={draft.scheduledAt}
            onChange={next => patch({ scheduledAt: next })}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Assign technician</Text>
            <TechnicianPicker
              options={TECHNICIANS}
              value={draft.technicianId}
              onChange={id => patch({ technicianId: id })}
            />
          </View>

          <Input
            label="Notes for technician"
            value={draft.notes}
            onChangeText={notes => patch({ notes })}
            placeholder="Any special instructions..."
            multiline
          />
        </ScrollView>

        {/* Footer sits outside the ScrollView so "Create job" is always
            reachable without scrolling to the bottom of a long form. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={handleSubmit}>
            Create job
          </Button>
        </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  content: {
    padding: spacing.s4,
    paddingBottom: spacing.s6,
    gap: spacing.s5,
  },
  section: {
    gap: spacing.s3,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textStrong,
  },
  addCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    // Keeps the row a 44px-tall tap target without a visible gap.
    paddingVertical: spacing.s2,
    marginTop: -spacing.s1,
  },
  addCustomerText: {
    ...typography.labelStrong,
    color: colors.textLink,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
