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
  /** Skill ids assigned at invite time (from `GET /skills`). */
  skillIds: string[];
}

/** Shape captured by the "Add technician" form. */
export interface NewTechnicianInput {
  name: string;
  /** Digits only, no dial code — see `DIAL_CODE` in this feature's constants. */
  phone: string;
  /** 1–20 skill ids, must belong to the owner's tenant (from `GET /skills`). */
  skillIds: string[];
}

/** Payload sent to `POST /auth/invite`. */
export interface InviteTechnicianRequest {
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** 6–15 digits, no country code. */
  phoneNumber: string;
  name: string;
  /** 1–20 UUIDs, unique, must belong to the owner's tenant. */
  skillIds: string[];
}

/** Response from `POST /auth/invite` — the backend only ever returns this id, nothing else. */
export interface InviteTechnicianResponse {
  inviteId: string;
}
