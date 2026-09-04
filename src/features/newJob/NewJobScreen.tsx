/**
 * NewJobScreen — full-screen route (pushed over the tabs) for creating a job.
 *
 * A page rather than a bottom sheet on purpose: the form already has five
 * sections and will grow (address, parts, estimate), and a sheet that tall
 * fights the keyboard on small phones.
 *
 * ⚠️ Every option on the form is real: service types from the tenant's
 * `serviceCategories` and the technician roster from `GET /users/me`, customers
 * from `GET /customers`. Submitting POSTs to `/jobs`.
 *
 * Technicians are filtered to those whose skills match the selected service
 * type, so the service type has to be chosen first. Customer, service type and
 * technician are all required — `POST /jobs` rejects a job without an assignee.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { customerService, jobService } from '../../services';
import type { ApiError } from '../../services';
import { upsertJob } from '../jobs';
import type { RootStackParamList } from '../../navigation/types';
import {
  AddCustomerSheet,
  useCustomers,
  upsertCustomer,
  DIAL_CODE,
} from '../customers';
import type { NewCustomerInput } from '../customers';
import { loadMyProfile, useMyProfile } from '../profile';
import { TechnicianPicker } from '../../components/TechnicianPicker';
import { DateTimeFields } from './components/DateTimeFields';
import { ServiceTypePicker } from './components/ServiceTypePicker';
import { resolveServiceCategories, technicianHasSkill } from './serviceCategories';
import type { NewJobDraft } from './types';
import { toJobServiceType } from "../../services/resources/jobs.ts";

type Props = NativeStackScreenProps<RootStackParamList, 'NewJob'>;

/**
 * Next half-hour boundary from now — 2:37 PM becomes 3:00 PM.
 *
 * Rounding up serves two purposes: the field reads as a deliberate default
 * rather than a timestamp, and the slot is always in the future, so a form
 * submitted immediately can't be rejected for a past `scheduledStart`.
 */
function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)));
  return d;
}

const initialDraft = (): NewJobDraft => ({
  serviceCategory: null,
  customerId: null,
  scheduledAt: nextHalfHour(),
  technicianId: null,
  notes: '',
});

export default function NewJobScreen({ navigation }: Props) {
  const [draft, setDraft] = useState<NewJobDraft>(initialDraft);
  const [customerSheetVisible, setCustomerSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Service types are the tenant's own `serviceCategories`, chosen at company
  // setup. Home already populates this store, so arriving here normally costs
  // no request — but a cold start straight to this route can still be loading.
  const { profile, isLoading, error, refresh } = useMyProfile();

  const {
    customers,
    isLoading: customersLoading,
    error: customersError,
    hasLoaded: customersLoaded,
    refresh: refreshCustomers,
  } = useCustomers();

  const serviceTypes = useMemo(
    () => resolveServiceCategories(profile?.tenant.serviceCategories ?? []),
    [profile?.tenant.serviceCategories],
  );

  /**
   * `Name · City`, not the full `customerLocation` string. A dropdown row needs
   * just enough to tell two same-named customers apart, and `customerLocation`
   * renders city-first while `serviceLocation` below builds address-first to
   * match the API's format — showing both on one screen read as inconsistent.
   * City alone sidesteps that and keeps the row short.
   */
  const customerOptions = useMemo(
    () =>
      customers.map(c => ({
        value: c.id,
        label: c.city ? `${c.name} · ${c.city}` : c.name,
      })),
    [customers],
  );

  /**
   * `serviceLocation` is required by the API and comes from the selected
   * customer's address. `ApiCustomer.address`/`city` are both nullable, so this
   * can legitimately be `''`.
   *
   * ⚠️ Sending `''` for a required string will very likely fail validation. It's
   * the agreed interim behavior on the basis that customer addresses won't be
   * null in practice — but if job creation starts 422-ing, this is why. The fix
   * is an editable service-location field on the form.
   */
  const serviceLocation = useMemo(() => {
    const customer = customers.find(c => c.id === draft.customerId);
    if (!customer) return '';
    return [customer.address, customer.city].filter(Boolean).join(', ');
  }, [customers, draft.customerId]);

  const trimmedNotes = draft.notes.trim();

  /**
   * The picker's `minimumDate` only constrains the *date* half, so picking today
   * and then an earlier time yields a slot in the past with no complaint from
   * the control. Checked here against the combined value.
   *
   * Recomputed each render rather than memorized: the comparison moves with the
   * clock, and a stale `true` would wrongly block a legitimate submit.
   */
  const isPastSlot = draft.scheduledAt.getTime() <= Date.now();

  /** The whole roster, from `/users/me` — server ids, safe to POST. */
  const allTechnicians = useMemo(
    () => profile?.technicians ?? [],
    [profile?.technicians],
  );

  /**
   * Only those tagged with the selected service type. Empty until a type is
   * picked — the section prompts for one rather than showing a roster that
   * then visibly shrinks, which reads like a bug.
   */
  const matchingTechnicians = useMemo(() => {
    const category = draft.serviceCategory;
    if (!category) return [];
    return allTechnicians.filter(t => technicianHasSkill(t.skills, category));
  }, [allTechnicians, draft.serviceCategory]);

  /**
   * The skill match is advisory, so a technician with no matching skill is
   * still offerable — but only once we know filtering found nobody. Otherwise,
   * the owner would see the full roster with no hint that none of them fit.
   */
  const noSkillMatch =
    Boolean(draft.serviceCategory) &&
    allTechnicians.length > 0 &&
    matchingTechnicians.length === 0;

  const technicianOptions = noSkillMatch ? allTechnicians : matchingTechnicians;

  const patch = (changes: Partial<NewJobDraft>) =>
    setDraft(current => ({ ...current, ...changes }));

  /**
   * Changing the service type clears a technician who isn't skilled in the new
   * one — otherwise the job silently carries a pairing the owner can no longer
   * see, since that technician has just been filtered out of the picker.
   */
  const handleServiceCategoryChange = (code: string) => {
    setDraft(current => {
      if (current.serviceCategory === code) return current;
      const roster = profile?.technicians ?? [];
      const keepTechnician =
        current.technicianId !== null &&
        roster.some(
          t => t.id === current.technicianId && technicianHasSkill(t.skills, code),
        );
      return {
        ...current,
        serviceCategory: code,
        technicianId: keepTechnician ? current.technicianId : null,
      };
    });
  };

  // All three ids are required by `POST /jobs` — a technician included. An
  // earlier version treated assignment as optional (book now, assign later),
  // which the API doesn't allow.
  const canSubmit =
    Boolean(draft.serviceCategory) &&
    Boolean(draft.customerId) &&
    Boolean(draft.technicianId) &&
    !isPastSlot &&
    !submitting;

  const handleSubmit = async () => {
    // Narrowed once here rather than cast at each use: `canSubmit` already
    // proves all three are set, but TypeScript can't see through it.
    const { serviceCategory, customerId, technicianId } = draft;
    if (!canSubmit || !serviceCategory || !customerId || !technicianId) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const job = await jobService.create({
        customerId,
        technicianId,
        serviceType: toJobServiceType(serviceCategory),
        // The API's example is UTC with a trailing `Z`, which is exactly what
        // toISOString produces. The picker works in device-local time, so this
        // is the conversion point.
        scheduledStart: draft.scheduledAt.toISOString(),
        serviceLocation,
        // One Notes field feeds both: `notesForTechnician` is its natural home,
        // and `description` mirrors it so a job isn't left with no summary.
        // Omitted entirely rather than sent as "" when the field is blank.
        ...(trimmedNotes
          ? { description: trimmedNotes, notesForTechnician: trimmedNotes }
          : {}),
        // `priority` and `requireCompletionPhoto` are deliberately omitted —
        // no UI for either, so the server's defaults (normal / false) apply.
      });
      // Drop the created row straight into the Jobs store: the tab's focus
      // refetch is throttled, so without this a job created within 15s of the
      // last successful load stays invisible until the throttle expires.
      upsertJob(job);
      // Fire-and-forget profile refresh with force: a successful mutation
      // invalidates the Home tiles immediately, so returning to Home shows
      // the new count even inside the throttle window. Failures are fine to
      // drop — Home's own focus refresh is the safety net.
      void loadMyProfile({ force: true });
      // TODO(jobs): navigate to the new job's detail screen once it exists,
      // rather than dropping back to wherever the owner came from.
      navigation.goBack();
    } catch (err) {
      setSubmitError((err as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCustomer = () => setCustomerSheetVisible(true);

  /**
   * `POST /customers`, then make the new customer selectable and select them —
   * creating one mid-flow only ever means "this is the customer for this job".
   *
   * The created row is pushed into the store directly rather than waiting on a
   * refetch: otherwise a failed refresh would leave `customerId` pointing at a
   * customer the dropdown doesn't have, and `Select` falls back to its
   * placeholder when the value matches no option — a job creatable with an
   * invisible customer and an empty service location.
   *
   * The refresh still runs afterward to pick up anything server-side, but it's
   * now belt-and-braces rather than load-bearing.
   *
   * Not caught here: `AddCustomerSheet` needs the rejection to stay open and
   * show the error rather than closing on a failed save.
   */
  const handleSubmitCustomer = async (input: NewCustomerInput) => {
    const address = [input.address, input.area].filter(Boolean).join(', ');

    const created = await customerService.create({
      name: input.name,
      countryCode: DIAL_CODE,
      phoneNumber: input.phone,
      ...(address ? { address } : {}),
      ...(input.city ? { city: input.city } : {}),
    });

    upsertCustomer(created);
    patch({ customerId: created.id });
    // A refresh failure must not read as a save failure — the customer exists
    // and is already selected — so it surfaces as the dropdown's own error
    // rather than being rethrown into the sheet.
    await refreshCustomers();
  };

  /**
   * The dropdown carries its own state in its placeholder and helper rather
   * than a separate status block: unlike the tile grid it's a single control,
   * and swapping it out for a spinner would make the form jump.
   *
   * `hasLoaded` is what separates "no customers yet" from "not fetched yet" —
   * without it a slow first load would read as an empty address book.
   */
  const customerPlaceholder = customersLoading
    ? 'Loading customers…'
    : customersError
      ? "Couldn't load customers"
      : customersLoaded && customerOptions.length === 0
        ? 'No customers yet'
        : 'Choose customer...';

  const customerHelper =
    customersError ??
    (customersLoaded && customerOptions.length === 0
      ? 'Add your first customer to create a job.'
      : '');

  /**
   * Four outcomes, none of which existed while this ran on sample constants:
   * the profile is still loading, the load failed, it succeeded but the tenant
   * set up no categories, or there are tiles to show. The empty case is not a
   * silent blank — without a category the form can't be submitted at all, so it
   * has to say why.
   */
  const renderServiceTypes = () => {
    if (!profile && isLoading) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (!profile) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            {error ?? "Couldn't load your service types."}
          </Text>
          <Button variant="secondary" size="sm" onPress={refresh}>
            Try again
          </Button>
        </View>
      );
    }

    if (serviceTypes.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No service types set up yet. Add them to your business profile from
            Account, then create the job.
          </Text>
        </View>
      );
    }

    return (
      <ServiceTypePicker
        options={serviceTypes}
        value={draft.serviceCategory}
        onChange={handleServiceCategoryChange}
      />
    );
  };

  /**
   * Gated on the service type, per the filtering rule above.
   *
   * `POST /jobs` requires `technicianId`, so unlike the other sections this one
   * genuinely blocks submission when it can't offer anyone — which is why the
   * empty-roster branch says to add a technician rather than offering to assign
   * later.
   */
  const renderTechnicians = () => {
    if (!draft.serviceCategory) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            Choose a service type first to see who can take this job.
          </Text>
        </View>
      );
    }

    if (allTechnicians.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No technicians yet. A job has to be assigned to someone, so add a
            technician before creating one.
          </Text>
        </View>
      );
    }

    return (
      <>
        {noSkillMatch ? (
          <Text style={styles.statusText}>
            No technician is tagged with this skill — showing everyone. Pick
            whoever will do the job.
          </Text>
        ) : null}
        <TechnicianPicker
          technicians={technicianOptions}
          selectedId={draft.technicianId}
          onSelect={id => patch({ technicianId: id })}
        />
      </>
    );
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
            {renderServiceTypes()}
          </View>

          <View style={styles.section}>
            <Select
              label="Customer"
              value={draft.customerId ?? undefined}
              onChange={id => patch({ customerId: id })}
              options={customerOptions}
              placeholder={customerPlaceholder}
              // A dropdown with nothing in it should not open an empty sheet —
              // the "Add new" link below is the way forward in that case.
              disabled={customerOptions.length === 0}
              helper={customerHelper}
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
            {/* A failed fetch leaves the Select disabled and empty, so without
                this the owner is stuck on a dead control with no way back. */}
            {customersError ? (
              <Button variant="secondary" size="sm" onPress={refreshCustomers}>
                Try again
              </Button>
            ) : null}
          </View>

          <View style={styles.section}>
            <DateTimeFields
              value={draft.scheduledAt}
              onChange={next => patch({ scheduledAt: next })}
            />
            {isPastSlot ? (
              <Text style={styles.fieldError}>
                Pick a time in the future.
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Assign technician</Text>
            {renderTechnicians()}
          </View>

          <Input
            label="Notes for technician"
            value={draft.notes}
            onChangeText={text => patch({ notes: text })}
            placeholder="Any special instructions..."
            multiline
          />
        </ScrollView>

        {/* Footer sits outside the ScrollView so "Create job" is always
            reachable without scrolling to the bottom of a long form. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {submitError ? (
            <Text style={styles.submitError}>{submitError}</Text>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={handleSubmit}>
            {submitting ? 'Creating…' : 'Create job'}
          </Button>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <AddCustomerSheet
        visible={customerSheetVisible}
        onClose={() => setCustomerSheetVisible(false)}
        onSubmit={handleSubmitCustomer}
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
  // Stand-in for the tile grid while loading / on failure / when the tenant has
  // no categories. Roughly one tile row tall so the form doesn't jump when the
  // real grid arrives.
  sectionStatus: {
    minHeight: 84,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.s3,
  },
  statusText: {
    ...typography.bodySm,
    color: colors.textMuted,
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
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
  },
});
