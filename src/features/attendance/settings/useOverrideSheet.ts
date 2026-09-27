/**
 * useOverrideSheet — the per-employee override sheet wiring for
 * `WeeklyOffScreen` (Story 15-6, FR-19).
 *
 * Owns which employee the sheet is open for (add vs edit), the tenant's
 * employee list, and the return-trip from the re-used
 * `SelectTechniciansScreen` picker. Navigation stays in the screen's hands —
 * this hook only pushes the picker route.
 *
 * Extracted so `WeeklyOffScreen.tsx` stays under the ~300-line file limit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  ProfileTechnician,
  WeeklyOffOverrideResponse,
} from '../../../services';
import type { RootStackParamList } from '../../../navigation/types';
import { useMyProfile } from '../../profile/useMyProfile';

type ScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AttendanceWeeklyOff'
>;

export type OverrideSheetState =
  | { kind: 'edit'; override: WeeklyOffOverrideResponse }
  | { kind: 'add'; picked?: ProfileTechnician }
  | null;

export interface UseOverrideSheetResult {
  openSheetFor: OverrideSheetState;
  closeSheet: () => void;
  /** Tenant employees — the picker's options, and the CTA's disabled gate. */
  employees: ProfileTechnician[];
  /**
   * Why the Add-override CTA is disabled, for the owner to read — null
   * whenever the CTA is enabled. A disabled button with no reason read as
   * a broken feature (device-check 2026-09-27: an all-invited roster left
   * the owner guessing).
   */
  addDisabledReason: string | null;
  openAddOverride: () => void;
  openEditOverride: (override: WeeklyOffOverrideResponse) => void;
  /** Push the shared technician picker (add mode). */
  onPickEmployee: () => void;
}

export function useOverrideSheet({
  navigation,
  route,
  onOpen,
}: Pick<ScreenProps, 'navigation' | 'route'> & {
  /**
   * Runs on EVERY path that opens the sheet — the Add CTA, an Edit tap and
   * the picker round-trip (15-6 review iteration 1). The screen drops a
   * held saveError here so a stale error from a previous open can never
   * render in, or re-key its 409 onto, the freshly mounted sheet.
   */
  onOpen?: () => void;
}): UseOverrideSheetResult {
  const [openSheetFor, setOpenSheetFor] = useState<OverrideSheetState>(null);
  const closeSheet = useCallback(() => setOpenSheetFor(null), []);

  const { profile, isLoading: isProfileLoading } = useMyProfile();
  // Active technicians only (15-6 review): `status` flips from 'invited' to
  // 'active' at first login, and an override for someone who never activated
  // is a rule for an employee who cannot be tracked. `ProfileTechnician.status`
  // is a plain string by design (no published enum), so match the one state
  // the backend is known to publish for a usable technician.
  const technicians = useMemo(() => profile?.technicians ?? [], [profile]);
  const employees = useMemo(
    () => technicians.filter((t) => t.status === 'active'),
    [technicians],
  );

  // The disabled CTA always carries its reason: a greyed "Set weekly off"
  // with no explanation reads as a defect (device-check 2026-09-27 — the
  // owner's roster was all-invited and nothing on screen said why the CTA
  // was dead).
  const addDisabledReason = useMemo(() => {
    if (isProfileLoading && !profile) return 'Loading your team…';
    if (technicians.length === 0) {
      return 'No employees yet. Add an employee first, then set their weekly off here.';
    }
    if (employees.length === 0) {
      return 'No active employees yet. Employees become active after they sign in to the app for the first time — then you can set their weekly off here.';
    }
    return null;
  }, [isProfileLoading, profile, technicians, employees]);

  const openAddOverride = useCallback(() => {
    onOpen?.();
    setOpenSheetFor({ kind: 'add' });
  }, [onOpen]);
  const openEditOverride = useCallback(
    (override: WeeklyOffOverrideResponse) => {
      onOpen?.();
      setOpenSheetFor({ kind: 'edit', override });
    },
    [onOpen],
  );

  // Push the existing technician picker; it returns the picked id via
  // navigate-back-with-params (`selectedTechnicianId` lands on OUR route
  // params — SelectCustomers/Skills use the same pattern). We pass
  // `returnTo` so the picker pops back to us on Apply instead of always
  // pushing the new-job screen, and `activeOnly` so the picker offers only
  // active employees (15-6 review iteration 1: the hook filters to active
  // here, but the picker listed everyone — a picked invited employee's id
  // could not be resolved below and the pick was silently dropped). We
  // clear the param after reading so it doesn't re-trigger on later
  // focuses.
  const onPickEmployee = useCallback(() => {
    navigation.navigate('SelectTechnicians', {
      returnTo: 'AttendanceWeeklyOff',
      activeOnly: true,
    });
  }, [navigation]);

  // React Navigation 7 merges navigate-back-with-params onto OUR route
  // params; the picker writes `selectedTechnicianId`. When the screen
  // regains focus with a freshly-set param, capture the pick into the
  // add sheet's `picked` slot and clear the param so later focuses stay
  // quiet (tab params persist across navigations by default).
  const pickedId = route.params?.selectedTechnicianId ?? null;
  const setParams = navigation.setParams;
  useEffect(() => {
    if (!pickedId) return;
    const employee = employees.find((e) => e.id === pickedId);
    if (employee) {
      onOpen?.();
      setOpenSheetFor({ kind: 'add', picked: employee });
    }
    setParams({ selectedTechnicianId: undefined });
  }, [pickedId, employees, setParams, onOpen]);

  return {
    openSheetFor,
    closeSheet,
    employees,
    addDisabledReason,
    openAddOverride,
    openEditOverride,
    onPickEmployee,
  };
}
