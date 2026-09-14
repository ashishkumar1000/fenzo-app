/**
 * EditJobSheet — bottom-sheet form to edit, reassign or (via its parent) cancel
 * a scheduled job. Uses the DS `Sheet` (native TrueSheet) at a fixed 85%
 * detent with a scrollable body; the hint + error + Save live in the native
 * `footer`, pinned to the sheet's bottom edge while the form scrolls beneath.
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
 * silently dropped from the patch — a hint above Save says so, but only
 * while the draft actually contains such a dropped edit.
 *
 * Error handling mirrors the backend's documented failures (api-contracts §6):
 * a job that started while being edited closes the sheet (the parent refetches
 * the detail, which shows why); a vanished technician refreshes the roster; a
 * 422 renders the server's message. All of that lives in `resolveSaveError`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input, Sheet } from '../../../components/ui';
import { Info } from 'lucide-react-native';
import { TechnicianPicker } from '../../../components/TechnicianPicker';
import { DateTimeFields } from '../../newJob/components/DateTimeFields';
import { colors, palette, radius, spacing, touch, typography } from '../../../theme';
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

/**
 * Shown only when the current draft would silently drop an edit — the API
 * can't clear fields (null/absent mean "leave unchanged") or unassign a job,
 * so a cleared field keeps its saved value and a deselected technician stays
 * assigned. Saying it at the moment it applies beats a permanent disclaimer
 * above Save.
 */
const DROPPED_TEXT_HINT =
  "Empty or spacing-only text won't save — the field keeps its saved value.";
const UNASSIGN_HINT =
  "You can't remove the technician here — they stay assigned until you pick a different one.";

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
   * Measured height of the pinned footer — pads the scrolled content so its
   * last fields can't end up hidden behind the floating footer when fully
   * scrolled. 0 until the first layout; the content padding updates as the
   * footer grows (e.g. when a form error appears).
   */
  const [footerHeight, setFooterHeight] = useState(0);
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

  // Clearance under the scrolled content: the measured footer height plus a
  // small buffer, so the last field clears the floating footer when fully
  // scrolled (falls back to a plain gap until the footer lays out).
  const footerClearance = footerHeight > 0 ? footerHeight + spacing.s32 : spacing.s32;

  // Hints for edits the API would silently drop — shown only while they apply.
  // The text-field test mirrors `buildPatch`'s drop rule exactly (`textChanged`:
  // a field is dropped when the trimmed draft is empty OR equals the saved
  // text), but fires on the raw draft — so a cleared field, spaces typed into
  // an empty field, and a whitespace-only tweak of the saved text all warn,
  // because in every case the user's typed text never reaches the wire.
  const textDropped = (draft: string, saved: string | null): boolean => {
    const trimmed = draft.trim();
    return trimmed === '' || trimmed === (saved ?? '');
  };
  const droppedHints = [
    (textDropped(description, job.description) && description !== (job.description ?? '')) ||
    (textDropped(notes, job.notesForTechnician) && notes !== (job.notesForTechnician ?? ''))
      ? DROPPED_TEXT_HINT
      : null,
    job.technicianId !== null && technicianId === null ? UNASSIGN_HINT : null,
  ].filter((hint): hint is string => hint !== null);

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
        // Force: this runs because the save rejected the assigned technician
        // (e.g. deleted since the roster loaded), so a throttled no-op would
        // leave the picker offering ids the server already rejects.
        void loadMyProfile({ force: true });
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

  // Pinned natively by the Sheet's `footer` — stays at the sheet's bottom
  // edge while the form scrolls beneath it. Opaque background so scrolled
  // content doesn't show through. `footerHeight` feeds the scroll content's
  // bottom clearance so the last fields stay reachable above the floating
  // footer.
  const footer = (
    <View
      style={styles.footer}
      onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
      {droppedHints.map(hint => (
        <View key={hint} style={styles.hintRow}>
          <Info
            size={16}
            color={colors.textMuted}
            strokeWidth={2}
            style={styles.hintIcon}
          />
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ))}

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
    </View>
  );

  return (
    <Sheet
      footer={footer}
      visible={visible}
      onClose={handleClose}
      // While the PATCH is in flight, drag-down and Android back are blocked
      // at the native level — `handleClose`'s veto alone fires too late (the
      // native sheet has already dismissed, leaving the parent stuck).
      dismissible={!(submitting || isAutoClosing)}
      title="Edit job"
      subtitle="Only scheduled jobs can be edited."
      detents={[0.85]}
      scrollable>
      {/* The native sheet stretches this ScrollView over the whole content
          area, so it always scrolls — even when the form is short. Drags hand
          off to the native gesture via the `scrollable` sheet. The footer
          (hint + error + Save) floats above it, so the scrolled content keeps
          a bottom clearance equal to the footer's measured height — otherwise
          the last fields could hide behind the floating Save button. */}
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: footerClearance }]}
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.s2,
    backgroundColor: palette.gray50,
  },
  hintIcon: {
    // Optical alignment with the hint's first text line (bodySm cap height).
    marginTop: spacing.s1,
  },
  footer: {
    // Sits on the sheet's own background, full width (the native footer
    // wrapper spans the sheet edge to edge with no padding).
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s4,
  },
  form: {
    gap: spacing.s4,
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
