/**
 * Fixed values for the technicians feature.
 *
 * DIAL_CODE/PHONE_LENGTH intentionally mirror `features/auth/constants.ts`
 * (single-country pilot) rather than importing from that feature — features
 * stay independent; if this ever needs to change, update both call sites.
 */

/** Default dial code (India). Single-country for the pilot. */
export const DIAL_CODE = '+91';

/** Local mobile number length (without dial code). */
export const PHONE_LENGTH = 10;
