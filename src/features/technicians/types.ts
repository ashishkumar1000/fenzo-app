/**
 * Technician domain types.
 *
 * `status` mirrors the Badge vocabulary used elsewhere: a freshly invited
 * technician is `offline` until they install the app and come online.
 */
export type TechnicianStatus = 'active' | 'offline';

export interface Technician {
  id: string;
  name: string;
  /** Phone number used for the SMS invite. Stored as the user typed it. */
  phone: string;
  status: TechnicianStatus;
  /** ISO timestamp of when the invite was created. */
  invitedAt: string;
}

/** Shape captured by the "Add technician" form. */
export interface NewTechnicianInput {
  name: string;
  phone: string;
}
