/**
 * NewJobScreen — full-screen route (pushed over the tabs) for creating a job.
 *
 * A page rather than a bottom sheet on purpose: the form already has five
 * sections and will grow (address, parts, estimate), and a sheet that tall
 * fights the keyboard on small phones.
 *
 * ⚠️ Every option on the form is real: the skill tiles come from the global
 * catalog (`GET /skills`, via the shared `useSkills` store), the technician
 * roster from `GET /users/me`, customers from `GET /customers`. Submitting
 * POSTs to `/jobs` with the selected `skillId`.
 *
 * Technicians are filtered to those whose `skillIds` contain the selected
 * skill id (exact id membership — no name comparison), so the skill has to be
 * chosen first. Customer, skill and technician are all required — `POST /jobs`
 * rejects a job without an assignee.
 *
 * Progressive disclosure (product feedback 2026-09-20): until a skill is
 * picked the screen shows the Skill section only — Customer, Date & time,
 * Assign technician and Notes appear once it is chosen.
 *
 * Sections are separated by the DS `SectionHead` — a hairline divider plus a
 * letter-spaced eyebrow label (product feedback 2026-09-20: the sections
 * previously ran in continuity with only whitespace between them). The
 * eyebrow is the section's only visible name: the Customer and Notes sections
 * name themselves nowhere else (the Skill section names itself inline in the
 * SkillPicker header instead — count chip and Browse all on one line, and
 * the CustomerPicker does the same beneath its eyebrow).
 *
 * "Add new technician" (product feedback 2026-09-20) opens the same sheet the
 * Technicians tab uses, over this form. The invite creates a real `users` row
 * server-side (status `invited`), so the new technician is assignable
 * immediately — but this picker reads the roster from `/users/me`, so the
 * handler forces a profile refresh and then auto-selects the newcomer when
 * they carry the selected skill.
 */
import { useEffect, useMemo, useState } from 'react';
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
import {
  Button,
  Input,
  SectionHead,
} from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { jobService } from '../../services';
import type { ApiError } from '../../services';
import { upsertJob } from '../jobs';
import type { RootStackParamList } from '../../navigation/types';
import { useCustomers } from '../customers';
import {
  getMyProfileSnapshot,
  loadMyProfile,
  useMyProfile,
} from '../profile';
import { TechnicianPicker } from '../../components/TechnicianPicker';
import { AddTechnicianSheet, useTechnicians } from '../technicians';
import type { NewTechnicianInput } from '../technicians';
import { loadSkills, useSkills } from '../skills';
import { DateTimeFields } from './components/DateTimeFields';
import { SkillPicker } from './components/SkillPicker';
import { CustomerPicker } from './components/CustomerPicker';
import type { NewJobDraft } from './types';

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
  skillId: null,
  customerId: null,
  scheduledAt: nextHalfHour(),
  technicianId: null,
  notes: '',
});

export default function NewJobScreen({ navigation, route }: Props) {
  const [draft, setDraft] = useState<NewJobDraft>(initialDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [addSheetVisible, setAddSheetVisible] = useState(false);

  // The inline "Add new technician" sheet performs the invite itself via
  // `add` (POST /auth/invite); New Job only reacts to its outcome.
  const { add: addTechnician } = useTechnicians();

  // `AddCustomerScreen` returns here with `createdCustomerId` on a successful
  // save when opened from this screen's "Add new" link — select it in the
  // draft, then clear the param (a flat, one-off stack param, unlike
  // `Customers`'s persistent tab params — but cleared anyway, on the same
  // principle: a param that's already been consumed shouldn't re-apply on
  // some later unrelated navigation).
  useEffect(() => {
    if (!route.params?.createdCustomerId) return;
    patch({ customerId: route.params.createdCustomerId });
    navigation.setParams({ createdCustomerId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.createdCustomerId, navigation]);

  // `SelectSkillsScreen` returns here with the picked skill on Apply — a
  // string picks it (clearing any technician who doesn't carry it), `null`
  // after "Clear" drops the skill and re-collapses the form. `undefined`
  // (param absent) means nothing to apply.
  useEffect(() => {
    const picked = route.params?.selectedSkillId;
    if (picked === undefined) return;
    if (picked === null) {
      setDraft(current => ({ ...current, skillId: null, technicianId: null }));
    } else {
      handleSkillChange(picked);
    }
    navigation.setParams({ selectedSkillId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.selectedSkillId, navigation]);

  // `SelectCustomersScreen` returns here with the picked customer on Apply —
  // a string picks it, `null` after "Clear" drops the customer (the grid
  // clears its selection; the job can't be submitted without one).
  // `undefined` (param absent) means nothing to apply.
  useEffect(() => {
    const picked = route.params?.selectedCustomerId;
    if (picked === undefined) return;
    patch({ customerId: picked });
    navigation.setParams({ selectedCustomerId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.selectedCustomerId, navigation]);

  // The tile grid needs the catalog. The store auto-loads on its subscribers'
  // mount too — this explicit call makes the screen self-sufficient on a cold
  // start regardless (loadSkills joins any in-flight request, so no double
  // GET).
  useEffect(() => {
    void loadSkills();
  }, []);

  // Skills come from the fixed global catalog, not the tenant. The store is
  // shared with the invite flow's picker, so arriving here after opening that
  // sheet normally costs no request — but a cold start straight to this route
  // still kicks one off (the mount effect below joins the store's own
  // auto-load rather than duplicating it; `loadSkills` is throttle/join-safe).
  const {
    skills,
    isLoading: skillsLoading,
    error: skillsError,
    refresh: refreshSkills,
  } = useSkills();

  // The roster and its degraded states. `Home` normally populates this store,
  // so arriving here costs no request — but a cold start straight to this
  // route can still be loading or failing.
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useMyProfile();

  const {
    customers,
    isLoading: customersLoading,
    error: customersError,
    hasLoaded: customersLoaded,
    refresh: refreshCustomers,
  } = useCustomers();

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
   * Only those whose `skillIds` contain the selected skill id — exact id
   * membership, never a name comparison. Empty until a skill is picked — the
   * section prompts for one rather than showing a roster that then visibly
   * shrinks, which reads like a bug.
   */
  const matchingTechnicians = useMemo(() => {
    const skillId = draft.skillId;
    if (!skillId) return [];
    // `skillIds ?? []`: a technician with a missing/null field simply never
    // matches — no crash, no special case.
    return allTechnicians.filter(t => (t.skillIds ?? []).includes(skillId));
  }, [allTechnicians, draft.skillId]);

  /**
   * The skill match is advisory, so a technician with no matching skill is
   * still offerable — but only once we know filtering found nobody. Otherwise,
   * the owner would see the full roster with no hint that none of them fit.
   */
  const noSkillMatch =
    Boolean(draft.skillId) &&
    allTechnicians.length > 0 &&
    matchingTechnicians.length === 0;

  const technicianOptions = noSkillMatch ? allTechnicians : matchingTechnicians;

  const patch = (changes: Partial<NewJobDraft>) =>
    setDraft(current => ({ ...current, ...changes }));

  /**
   * Changing the skill clears a technician who doesn't carry it — otherwise
   * the job silently carries a pairing the owner can no longer see, since
   * that technician has just been filtered out of the picker.
   */
  const handleSkillChange = (id: string) => {
    setDraft(current => {
      if (current.skillId === id) return current;
      const roster = profile?.technicians ?? [];
      const keepTechnician =
        current.technicianId !== null &&
        roster.some(
          t => t.id === current.technicianId && (t.skillIds ?? []).includes(id),
        );
      return {
        ...current,
        skillId: id,
        technicianId: keepTechnician ? current.technicianId : null,
      };
    });
  };

  // All three ids are required by `POST /jobs` — a technician included. An
  // earlier version treated assignment as optional (book now, assign later),
  // which the API doesn't allow.
  const canSubmit =
    Boolean(draft.skillId) &&
    Boolean(draft.customerId) &&
    Boolean(draft.technicianId) &&
    !isPastSlot &&
    !submitting;

  const handleSubmit = async () => {
    // Narrowed once here rather than cast at each use: `canSubmit` already
    // proves all three are set, but TypeScript can't see through it.
    const { skillId, customerId, technicianId } = draft;
    if (!canSubmit || !skillId || !customerId || !technicianId) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const job = await jobService.create({
        customerId,
        technicianId,
        skillId,
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
        // `priority` is deliberately omitted — no UI for it, so the server's
        // default (normal) applies.
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

  // `AddCustomerScreen` creates the customer, pushes it into the shared store,
  // and returns here with `createdCustomerId` (consumed by the `useEffect`
  // above) — nothing left to do here but navigate.
  const handleAddCustomer = () =>
    navigation.navigate('AddCustomer', { returnRouteName: 'NewJob' });

  /**
   * The inline sheet's submit. `add` rejects with `ApiError` on a failed
   * invite, which is what keeps the sheet open to show the error — so the
   * refresh and selection below only run on success.
   *
   * The picker's roster comes from `/users/me`, not the local technician
   * store the invite writes to, so a forced profile refresh is what actually
   * makes the newcomer visible. With the fresh roster in, the new technician
   * is auto-selected when they carry the selected skill — the owner just
   * added them for this job. Matched by phone number (unique per tenant —
   * the invite itself rejects duplicates), never by the `invite_…` id, whose
   * relationship to the real user id the API doesn't guarantee.
   */
  const handleAddTechnicianSubmit = async (input: NewTechnicianInput) => {
    await addTechnician(input);
    await loadMyProfile({ force: true });
    const added = getMyProfileSnapshot()?.technicians.find(
      t => t.phoneNumber === input.phone.trim(),
    );
    if (
      added &&
      draft.skillId !== null &&
      (added.skillIds ?? []).includes(draft.skillId)
    ) {
      patch({ technicianId: added.id });
    }
  };

  /**
   * Four outcomes, none of which existed while this ran on sample constants:
   * the catalog is still loading, the load failed with nothing to show, it
   * succeeded but the platform seeds no skills, or there are tiles to show.
   * The empty case is not a silent blank — without a skill the form can't be
   * submitted at all, so it has to say why.
   *
   * A failed refresh with rows already on screen keeps the tiles (stale but
   * usable) rather than blanking the grid — only a failure with nothing to
   * show blocks the form behind the retry.
   */
  const renderSkills = () => {
    // Spinner whenever nothing is on screen yet — a first load or a retry
    // that started from empty. (A retry over existing rows is handled below:
    // the stale-but-usable tiles stay up.)
    if (skillsLoading && skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (skillsError && skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>{skillsError}</Text>
          <Button variant="secondary" size="sm" onPress={refreshSkills}>
            Try again
          </Button>
        </View>
      );
    }

    if (skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No skills are available yet. Try again shortly.
          </Text>
        </View>
      );
    }

    return (
      <SkillPicker
        title="Skill"
        options={skills}
        value={draft.skillId}
        onChange={handleSkillChange}
        onBrowseAll={() =>
          navigation.navigate('SelectSkills', {
            selectedSkillId: draft.skillId,
          })
        }
      />
    );
  };

  /**
   * The customer section mirrors the skills one: while the store's first
   * load is in flight (or failed with nothing to show) there is nothing to
   * tile, and saying "no customers" for a list that merely didn't arrive
   * would read as "you have nobody" — a spinner/retry is the honest state.
   * A failed refresh over rows already on screen keeps the tiles (stale but
   * usable) rather than blanking the grid.
   *
   * An empty-but-loaded address book is a real state: the "Add new" link
   * below is the way forward, so the status copy points there rather than
   * pretending a customer can be picked.
   */
  const renderCustomers = () => {
    if (customersLoading && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (customersError && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>{customersError}</Text>
          <Button variant="secondary" size="sm" onPress={refreshCustomers}>
            Try again
          </Button>
        </View>
      );
    }

    if (customersLoaded && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No customers yet. Add your first customer to create a job.
          </Text>
        </View>
      );
    }

    return (
      <CustomerPicker
        options={customers}
        value={draft.customerId}
        onChange={id => patch({ customerId: id })}
        onBrowseAll={() =>
          navigation.navigate('SelectCustomers', {
            selectedCustomerId: draft.customerId,
          })
        }
      />
    );
  };

  /**
   * Rendered only once a skill is picked — before that the whole rest of the
   * form is hidden (progressive disclosure), so there is no "choose a skill
   * first" placeholder to show here.
   *
   * The roster's degraded states mirror the skills section: while the
   * profile is still loading (or failed) there is nothing to show yet, and
   * saying "No technicians yet" for a roster that merely didn't arrive would
   * read as "you have nobody" — a spinner/retry is the honest state.
   *
   * `POST /jobs` requires `technicianId`, so unlike the other sections this one
   * genuinely blocks submission when it can't offer anyone — which is why the
   * empty-roster branch says to add a technician rather than offering to assign
   * later.
   */
  const renderTechnicians = () => {
    if (profileLoading && allTechnicians.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (profileError && allTechnicians.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>{profileError}</Text>
          <Button variant="secondary" size="sm" onPress={refreshProfile}>
            Try again
          </Button>
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
            {renderSkills()}
          </View>

          {/* Progressive disclosure (product feedback 2026-09-20): nothing
              but the Skill section shows until a skill is picked — Customer,
              Date & time, Assign technician and Notes all appear once it is.
              The skill drives the technician filter, so it is the one
              decision the rest of the form depends on. */}
          {draft.skillId ? (
            <>
              <View style={styles.section}>
                <SectionHead title="Customer" />
                {renderCustomers()}
                <Pressable
                  onPress={handleAddCustomer}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.inlineAddRow}>
                  <UserPlus size={18} color={colors.textLink} strokeWidth={2} />
                  <Text style={styles.inlineAddText}>
                    Customer not in list? Add new
                  </Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <SectionHead title="Date & time" />
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
                <SectionHead title="Assign technician" />
                {renderTechnicians()}
                <Pressable
                  onPress={() => setAddSheetVisible(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.inlineAddRow}>
                  <UserPlus size={18} color={colors.textLink} strokeWidth={2} />
                  <Text style={styles.inlineAddText}>Add new technician</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <SectionHead title="Notes for technician" />
                <Input
                  value={draft.notes}
                  onChangeText={text => patch({ notes: text })}
                  placeholder="Any special instructions..."
                  multiline
                  accessibilityLabel="Notes for technician"
                />
              </View>
            </>
          ) : null}
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

      <AddTechnicianSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        onSubmit={handleAddTechnicianSubmit}
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
    // Icon-only control — an explicit touch.min box with the icon centred;
    // the 24px icon plus hitSlop alone came to ~40px, under the design
    // system's ≥44px minimum.
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Stand-in for the tile grid while loading / on failure / when the catalog
  // has no skills. Roughly one tile row tall so the form doesn't jump when
  // the real grid arrives.
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
  // Shared by the customer and technician inline-add rows — same link
  // treatment on purpose: the two sections read as one pattern.
  inlineAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    // Keeps the row a 44px-tall tap target without a visible gap.
    paddingVertical: spacing.s2,
    marginTop: -spacing.s1,
  },
  inlineAddText: {
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
