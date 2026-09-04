/**
 * New-job domain types.
 *
 * Kept local to the feature while the screen runs on the sample constants in
 * `data.ts`. Promote to `src/types` (and swap `ServiceType.icon` for whatever
 * the API returns) once a real job service backs the create flow.
 */
import type { LucideIcon } from 'lucide-react-native';

/** Service-type tile shown in the picker grid. */
export interface ServiceType {
  /** The API's service-category code, e.g. `ac_technician`. */
  id: string;
  label: string;
  /** Glyph rendered above the label — presentation only, see `serviceCategories.ts`. */
  icon: LucideIcon;
}

/**
 * What the form collects. `serviceTypeId`, `customerId` and `technicianId`
 * are null until picked, so the submit button can tell "untouched" from
 * "deliberately empty".
 */
export interface NewJobDraft {
  /**
   * The tenant's service-category code (e.g. `ac_technician`) — the value the
   * API expects, not a local id, so it POSTs straight through.
   */
  serviceCategory: string | null;
  customerId: string | null;
  /** Date and time are held as one `Date`; the two fields edit it separately. */
  scheduledAt: Date;
  technicianId: string | null;
  notes: string;
}
