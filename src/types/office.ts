/**
 * Office domain model (Story 15-4) — mirrors the backend
 * `OfficeResponse`/`OfficeRuleResponse` shapes documented in fenzit-be
 * `docs/api-contracts.md` ("Attendance offices", Story 15-3).
 */

/**
 * One effective-dated timing/hours rule. Times are `HH:mm` 24-hour strings,
 * dates are `YYYY-MM-DD`; `validTo` is null while the rule is open-ended.
 */
export interface OfficeRule {
  id: string;
  startTime: string;
  endTime: string;
  /** Minutes after `startTime` until a check-in counts as late. */
  lateCutoffMinutes: number;
  fullDayHours: number;
  halfDayHours: number;
  validFrom: string;
  validTo: string | null;
}

/**
 * An office list row. `rule` is the rule valid on today (picked
 * server-side); `nextRule` is non-null only while a pending rules edit
 * awaits its effective-from date. `archivedAt` non-null marks an archived
 * office (typically with no `rule`).
 */
export interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  archivedAt: string | null;
  rule: OfficeRule | null;
  nextRule: OfficeRule | null;
}

/**
 * Full office detail — the edit screen's source. `rules` is the complete
 * effective-dated history, ascending by `validFrom`.
 */
export interface OfficeDetail {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  archivedAt: string | null;
  rules: OfficeRule[];
}

/** A tracked employee blocking an archive (AD-25). */
export interface OfficeArchiveBlocker {
  employeeId: string;
  employeeName: string;
}

/**
 * What the map picker returns to the form — the final pin position and
 * radius are what gets saved, never an intermediate search result.
 * `gpsVerified` is true only when the confirmed pin came from the device's
 * own location fix (locate-me / the silent initial fix) — panning or a
 * search result clears it. Drives the "GPS Verified" chip on the form.
 */
export interface PickedOfficeLocation {
  latitude: number;
  longitude: number;
  radiusM: number;
  gpsVerified?: boolean;
}
