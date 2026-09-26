/**
 * OfficeFormScreen — add/edit an attendance office (Story 15-4).
 *
 * Add mode posts the full create payload; edit mode PATCHes only what
 * changed — profile fields (name/pin/radius) apply immediately, the rules
 * fields travel as the complete five-field set through the effective-dated
 * RPC (partial set is a 400 server-side) and carry the "tomorrow" copy.
 *
 * The pin comes from the map picker: the location row opens
 * `OfficeMapPicker`, which returns the FINAL pin position via
 * navigate-back-with-params (`pickedLocation`) — a search result only ever
 * moved the map.
 *
 * Documented failures: 409 name-taken → inline name error; 404 on load
 * (unknown/archived office) → notice + back to list; archive 409 → the
 * inline blocking-employee count (no dead-end error; the Employees-list
 * shortcut lands in 15-9).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Archive, Building2, Check } from 'lucide-react-native';
import { Badge, Button, InlineError, Input } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { officesService } from '../../../services';
import type { ApiError } from '../../../services';
import type { OfficeDetail } from '../../../types/office';
import {
  buildCreateRequest,
  buildUpdatePatch,
  emptyOfficeForm,
  formFromDetail,
  hasErrors,
  validateOfficeForm,
  type OfficeFormErrors,
  type OfficeFormState,
} from './officeFormModel';
import OfficeLocationCard from './OfficeLocationCard';
import OfficeRuleFields from './OfficeRuleFields';
import ScreenHeader from './ScreenHeader';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OfficeForm'>;

export default function OfficeFormScreen({ navigation, route }: Props) {
  const officeId = route.params?.officeId;
  const isEdit = Boolean(officeId);

  const [form, setForm] = useState<OfficeFormState>(emptyOfficeForm);
  // True only while the pin is the device's own fix (map picker locate-me).
  // An edit-loaded office has unknown provenance — the chip stays hidden.
  const [gpsVerified, setGpsVerified] = useState(false);
  const [errors, setErrors] = useState<OfficeFormErrors>({});
  const [detail, setDetail] = useState<OfficeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const onChange = useCallback((patch: Partial<OfficeFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  // Edit mode: pre-fill from the office's rules history. A 404 (unknown or
  // archived) shows the notice instead of a broken form.
  useEffect(() => {
    if (!officeId) return;
    let active = true;
    officesService
      .get(officeId)
      .then((loaded) => {
        if (!active) return;
        setDetail(loaded);
        setForm(formFromDetail(loaded));
        setIsLoading(false);
      })
      .catch((err: ApiError) => {
        if (!active) return;
        if (err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError('Could not load this office. Check your connection and try again.');
        }
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officeId]);

  // The map picker's confirmed pin arrives via navigate-back-with-params.
  // Re-applies are idempotent (same values), so no param clear is needed.
  useEffect(() => {
    const picked = route.params?.pickedLocation;
    if (!picked) return;
    setForm((prev) => ({
      ...prev,
      latitude: picked.latitude,
      longitude: picked.longitude,
      radiusM: picked.radiusM,
    }));
    setGpsVerified(Boolean(picked.gpsVerified));
    setErrors((prev) => ({ ...prev, location: undefined }));
  }, [route.params?.pickedLocation]);

  const handleSave = useCallback(async () => {
    const validation = validateOfficeForm(form);
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaveError(null);
    setSaving(true);
    try {
      if (!isEdit) {
        await officesService.create(buildCreateRequest(form));
      } else if (detail) {
        const patch = buildUpdatePatch(form, detail);
        if (Object.keys(patch).length > 0) {
          await officesService.update(officeId as string, patch);
        }
      } else {
        // Edit mode with no loaded detail (the non-404 load-error path):
        // there is nothing to diff the PATCH against — fail loud instead of
        // a silent no-op that reads as a successful save.
        setSaveError('This office could not be loaded. Check your connection and try again.');
        return;
      }
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'ATTENDANCE_OFFICE_NAME_TAKEN') {
        setErrors((prev) => ({
          ...prev,
          name: 'That name is already used by another office',
        }));
      } else {
        setSaveError(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, detail, officeId, navigation]);

  const handleArchive = useCallback(() => {
    if (!officeId) return;
    // Standard destructive confirm pattern (same shape as Log out). The
    // dialog names the SAVED office (detail), not the unsaved form value —
    // renaming without saving must not show the new name while archiving
    // the old one.
    Alert.alert(
      'Archive office',
      `"${detail?.name ?? form.name.trim()}" will stop tracking attendance. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            setArchiving(true);
            setArchiveError(null);
            officesService
              .archive(officeId)
              .then(() => navigation.goBack())
              .catch((err: ApiError) => {
                if (err.code === 'ATTENDANCE_OFFICE_ARCHIVE_BLOCKED') {
                  const blockers =
                    (err.details as { blockers?: unknown[] } | undefined)?.blockers ?? [];
                  // A missing/empty blockers array still means "blocked" —
                  // never render the nonsense "0 employees are still assigned".
                  setArchiveError(
                    blockers.length === 0
                      ? 'Employees are still assigned here — reassign them first'
                      : `${blockers.length} employee${blockers.length === 1 ? ' is' : 's are'} still assigned here — reassign them first`,
                  );
                } else {
                  setArchiveError(err.message);
                }
              })
              .finally(() => setArchiving(false));
          },
        },
      ],
    );
  }, [officeId, detail, form.name, navigation]);

  if (notFound) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Office" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <InlineError message="This office is no longer available. It may have been archived." />
          <Button variant="secondary" onPress={() => navigation.goBack()}>
            Back to offices
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title={isEdit ? 'Edit office' : 'Add office'}
        onBack={() => navigation.goBack()}
        right={
          isEdit ? (
            // Not a job state — the DS 'done' green is its positive/active
            // colour; the job-state 'progress' variant is a different token.
            <Badge status="done" dot>
              Active
            </Badge>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loadError ? <InlineError message={loadError} /> : null}
        <Input
          label="Office name"
          value={form.name}
          onChangeText={(text) => onChange({ name: text })}
          placeholder="e.g. Andheri branch"
          error={errors.name}
          maxLength={80}
          autoCorrect={false}
          required
          leadingIcon={<Building2 size={18} color={colors.textMuted} strokeWidth={2} />}
        />

        <OfficeLocationCard
          form={form}
          errors={errors}
          gpsVerified={gpsVerified}
          onOpenPicker={() =>
            navigation.navigate('OfficeMapPicker', {
              initialLatitude: form.latitude ?? undefined,
              initialLongitude: form.longitude ?? undefined,
              radiusM: form.radiusM,
            })
          }
        />

        <OfficeRuleFields state={form} errors={errors} onChange={onChange} isEdit={isEdit} />

        {saveError ? <InlineError message={saveError} /> : null}
        <Button
          fullWidth
          loading={saving}
          leadingIcon={
            saving ? undefined : <Check size={18} color={colors.textOnColor} strokeWidth={2.5} />
          }
          onPress={() => void handleSave()}>
          {isEdit ? 'Save changes' : 'Create office'}
        </Button>

        {isEdit ? (
          <View style={styles.dangerBlock}>
            {archiveError ? <InlineError message={archiveError} /> : null}
            <Button
              variant="ghost"
              fullWidth
              loading={archiving}
              labelColor={colors.danger}
              leadingIcon={
                archiving ? undefined : <Archive size={16} color={colors.danger} strokeWidth={2} />
              }
              onPress={handleArchive}>
              Archive office
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  dangerBlock: {
    gap: spacing.s2,
  },
});
