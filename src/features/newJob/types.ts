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
  id: string;
  label: string;
  /** Glyph rendered above the label. Local concern — the API will send an id. */
  icon: LucideIcon;
}

/** Option for the customer dropdown. `id` becomes the Select's `value`. */
export interface CustomerOption {
  id: string;
  name: string;
}

/** Option for the technician picker row. */
export interface TechnicianOption {
  id: string;
  name: string;
}

/**
 * What the form collects. `serviceTypeId`, `customerId` and `technicianId`
 * are null until picked, so the submit button can tell "untouched" from
 * "deliberately empty".
 */
export interface NewJobDraft {
  serviceTypeId: string | null;
  customerId: string | null;
  /** Date and time are held as one `Date`; the two fields edit it separately. */
  scheduledAt: Date;
  technicianId: string | null;
  notes: string;
}
