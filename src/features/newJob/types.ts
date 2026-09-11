/**
 * New-job domain types.
 */

/**
 * What the form collects. `skillId`, `customerId` and `technicianId` are null
 * until picked, so the submit button can tell "untouched" from "deliberately
 * empty".
 */
export interface NewJobDraft {
  /**
   * The global skills-catalog id (`GET /skills`) — the value the API expects,
   * not a local id, so it POSTs straight through as the create body's
   * `skillId`.
   */
  skillId: string | null;
  customerId: string | null;
  /** Date and time are held as one `Date`; the two fields edit it separately. */
  scheduledAt: Date;
  technicianId: string | null;
  notes: string;
}
