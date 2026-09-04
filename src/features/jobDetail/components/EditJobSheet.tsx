/**
 * EditJobSheet — bottom-sheet form to edit, reassign or (via its parent) cancel
 * a scheduled job. Standard sheet chrome (scrim, rounded top, grabber), the
 * same as AddTechnicianSheet.
 *
 * Form state is re-initialized from the job each time the sheet opens — but
 * only on the false→true transition: a background refetch landing while the
 * sheet is open swaps the `job` object and would otherwise re-seed here,
 * wiping the user's in-progress edits. Saving sends only the changed fields
 * (see `buildPatch` in `editJobModel.ts`) — an empty diff keeps Save
 * disabled, since the server 422s an empty patch.
 *
 * The API cannot clear a field (null/absent mean "leave unchanged") and
 * cannot unassign a job, so emptied text and a deselected technician are
 * silently dropped from the patch — the hint line above Save says so.
 *
 * Error handling mirrors the backend's documented failures (api-contracts §6):
 * a job that started while being edited closes the sheet (the parent refetches
 * the detail, which shows why); a vanished technician refreshes the roster; a
 * 422 renders the server's message. All of that lives in `resolveSaveError`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '../../../components/ui';
import { TechnicianPicker } from '../../../components/TechnicianPicker';
import { DateTimeFields } from '../../newJob/components/DateTimeFields';
import { colors, radius, shadow, spacing, touch, typography } from '../../../theme';
import { jobService } from '../../../services';
import type { ApiError, ApiJob, JobDetail, JobPriority, ProfileTechnician } from '../../../services';
import { loadMyProfile } from '../../profile';
import {
  buildPatch,
  pastSlotError,
  resolveSaveError,
  scheduleWindowError,
  type EditJobDraft,
} from '../editJobModel';

/**
 * How long the "job already started" message stays visible before the sheet
 * closes itself (the parent then refetches the detail). Long enough to read,
 * short enough not to feel stuck.
 */
const CLOSE_DELAY_MS = 1500;

/** The API can't clear fields or unassign — say so instead of a silent no-op. */
const NO_CLEAR_HINT =
  'Emptied fields keep their saved value, and the assigned technician stays until you pick another one.';

type Props = {
  visible: boolean;
  job: JobDetail;
  technicians: ProfileTechnician[];
  onClose: () => void;
  /** Called with the updated job on a 200. */
  onSaved: (job: ApiJob) => void;
};

const PRIORITIES: Array<{ value: JobPriority; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
];

export function EditJobSheet({ visible, job, technicians, onClose, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => new Date());
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [technicianId, setTechnicianId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  /**
   * True during the 1.5s "job already started" auto-close — Save stays
   * disabled and the backdrop/back are inert until the sheet actually closes.
   */
  const [isAutoClosing, setIsAutoClosing] = useState(false);

  // The "job already started" close timer, so an unmount mid-wait can't fire
  // `onClose` into a dead screen.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks whether the current open has already seeded the form — the re-seed
  // effect below runs on [visible, job], but a job swap mid-open (a background
  // refetch landing) must NOT wipe the user's edits.
  const wasVisibleRef = useRef(false);

  // The API cannot unassign a job, and a technician still awaiting app install
  // can't take one yet — invited technicians are hidden rather than offered
  // as a reassign target (the tiles variant marks them instead; on the edit
  // sheet they simply have no business being options).
  const assignableTechnicians = useMemo(
    () => technicians.filter(t => t.status !== 'invited'),
    [technicians],
  );

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;

    setDescription(job.description ?? '');
    setScheduledAt(new Date(job.scheduledStart));
    setNotes(job.notesForTechnician ?? '');
    setPriority(job.priority);
    setTechnicianId(job.technicianId);
    setFormError('');
    setIsAutoClosing(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [visible, job]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const draft: EditJobDraft = {
    description,
    scheduledStart: scheduledAt,
    notesForTechnician: notes,
    priority,
    technicianId,
  };
  const patch = buildPatch(job, draft);

  const handleClose = () => {
    // Don't let a backdrop tap or the Android back button dismiss the sheet
    // mid-request: the patch is already in flight and can't be cancelled, and
    // closing now would let its eventual `catch` write into a sheet the user
    // no longer sees, surfacing as a stale error the next time they open it.
    // Same while the auto-close countdown runs — the close is already coming.
    if (submitting || isAutoClosing) return;
    onClose();
  };

  const handleSave = async () => {
    if (!patch || submitting || isAutoClosing) return;

    // Pre-validate the schedule window before any request (the server 422s
    // the same inversion — this catches it client-side).
    const windowError = scheduleWindowError(patch, job);
    if (windowError) {
      setFormError(windowError);
      return;
    }

    // Parity with New job: a rescheduled slot in the past is rejected here,
    // not left for the server (see `pastSlotError` in `editJobModel.ts`).
    const pastError = pastSlotError(patch);
    if (pastError) {
      setFormError(pastError);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const updated = await jobService.update(job.id, patch);
      onSaved(updated);
      onClose();
    } catch (caught) {
      const resolution = resolveSaveError(patch, caught as ApiError);
      setFormError(resolution.message);
      if (resolution.refreshRoster) {
        loadMyProfile();
      }
      if (resolution.closeSheet) {
        // Show why, then hand the parent a close — it refetches the detail,
        // which now shows the job as started. Clear any stray timer first so
        // this failure can never schedule two closes.
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        setIsAutoClosing(true);
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          setIsAutoClosing(false);
          onClose();
        }, CLOSE_DELAY_MS);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />

            <Text style={styles.title}>Edit job</Text>
            <Text style={styles.subtitle}>Only scheduled jobs can be edited.</Text>

            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <Input
                label="Description"
                value={description}
                onChangeText={text => {
                  setFormError('');
                  setDescription(text);
                }}
                placeholder="What needs doing?"
                multiline
                numberOfLines={3}
              />

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Schedule</Text>
                <DateTimeFields
                  value={scheduledAt}
                  onChange={next => {
                    setFormError('');
                    setScheduledAt(next);
                  }}
                />
              </View>

              <Input
                label="Notes for technician"
                value={notes}
                onChangeText={text => {
                  setFormError('');
                  setNotes(text);
                }}
                placeholder="Any special instructions..."
                multiline
                numberOfLines={3}
              />

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Priority</Text>
                <View style={styles.pillRow}>
                  {PRIORITIES.map(option => {
                    const isSelected = option.value === priority;
                    return (
                      <Pressable
                        key={option.value}
                        testID={`edit-job-priority-${option.value}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => {
                          setFormError('');
                          setPriority(option.value);
                        }}
                        style={[styles.pill, isSelected && styles.pillSelected]}>
                        <Text
                          style={[
                            styles.pillLabel,
                            isSelected && styles.pillLabelSelected,
                          ]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Technician</Text>
                <TechnicianPicker
                  variant="rows"
                  technicians={assignableTechnicians}
                  selectedId={technicianId}
                  onSelect={id => {
                    setFormError('');
                    setTechnicianId(id);
                  }}
                />
              </View>
            </ScrollView>

            <Text style={styles.hint}>{NO_CLEAR_HINT}</Text>

            {formError ? (
              <Text style={styles.formError} testID="edit-job-form-error">
                {formError}
              </Text>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              testID="edit-job-save"
              disabled={!patch || submitting || isAutoClosing}
              onPress={handleSave}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    gap: spacing.s4,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    marginBottom: spacing.s2,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: -spacing.s2,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  formScroll: {
    // Let the form grow with the roster instead of pushing the footer away.
    maxHeight: 420,
  },
  form: {
    gap: spacing.s4,
    paddingBottom: spacing.s2,
  },
  section: {
    gap: spacing.s3,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textStrong,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  pill: {
    flex: 1,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
  },
  pillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pillLabel: {
    ...typography.label,
    color: colors.textBody,
  },
  pillLabelSelected: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  formError: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
