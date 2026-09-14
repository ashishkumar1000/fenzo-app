/**
 * Defensive parser for `activityLog[].metadata` location payloads
 * (story 7.10). The advance-workflow RPC merges the location fields with
 * `jsonb_strip_nulls`, so absent keys vanish rather than arriving null —
 * and pre-Epic-7 rows (plus non-step events like `job_reassigned`) carry
 * entirely different metadata. The parser reproduces the RPC's write
 * branches exactly (`fenzit-be` migration `20260913000002`) and never
 * trusts the wire shape. Pure functions, no React.
 */

export type StepLocation =
  | {
      kind: 'captured';
      latitude: number;
      longitude: number;
      accuracy: number | null;
      flagged: boolean;
    }
  | { kind: 'missed'; reason: string | null }
  | { kind: 'none' };

const NONE: StepLocation = { kind: 'none' };

/** Finite number within [min, max], or null — no fabrication, no half-used values. */
function toCoord(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Classify one activity-log entry's metadata per the RPC's write branches. */
export function parseStepLocation(
  metadata: Record<string, unknown> | null,
): StepLocation {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return NONE;
  }

  const latitude = toCoord(metadata.latitude, -90, 90);
  const longitude = toCoord(metadata.longitude, -180, 180);

  // Lat/long arrive together or not at all (RPC rule) — a partial pair is
  // no coordinates, falling through to the missed-capture branch.
  if (latitude !== null && longitude !== null) {
    const accuracy =
      typeof metadata.accuracy === 'number' && Number.isFinite(metadata.accuracy)
        ? metadata.accuracy
        : null;
    return {
      kind: 'captured',
      latitude,
      longitude,
      accuracy,
      flagged: metadata.accuracyFlagged === true,
    };
  }

  if (metadata.locationCaptured === false) {
    return {
      kind: 'missed',
      reason: typeof metadata.reason === 'string' && metadata.reason ? metadata.reason : null,
    };
  }

  return NONE;
}

/**
 * The job site as the timeline's `jobSite` prop — the customer's saved
 * coordinates, or null when the customer has none. Never half-used: a
 * missing either half means no distance can be computed. Values are
 * range-validated like `parseStepLocation` — a wire contract violation
 * must never reach haversine as NaN.
 */
export function jobSiteCoords(customer: {
  latitude: number | null;
  longitude: number | null;
}): { latitude: number; longitude: number } | null {
  const latitude = toCoord(customer.latitude, -90, 90);
  const longitude = toCoord(customer.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

/**
 * The technician's last known position: the most recent captured GPS fix on
 * a workflow step (the API returns entries oldest-first, so the last
 * captured step row wins). Non-step events never count as a fix — only
 * step advances capture the technician's position. Null when no step ever
 * captured a fix — the Direction affordance stays disabled rather than
 * navigating somewhere stale or fabricated.
 */
export function lastKnownTechnicianLocation(
  entries: { eventType: string; metadata: Record<string, unknown> | null }[],
): { latitude: number; longitude: number } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!entries[i].eventType?.startsWith('step_')) continue;
    const location = parseStepLocation(entries[i].metadata);
    if (location.kind === 'captured') {
      return { latitude: location.latitude, longitude: location.longitude };
    }
  }
  return null;
}
