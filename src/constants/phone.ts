/**
 * Phone constants — the single definition.
 *
 * These used to be copied into `features/auth`, `features/technicians` and
 * `features/customers`, each with a comment saying "update all call sites if
 * this changes". Three copies of a value that must agree is a bug waiting for
 * the day the pilot stops being single-country, so the value lives here and
 * those feature `constants.ts` files re-export it — feature code still imports
 * from its own feature, so nothing else had to change.
 */

/** Default dial code (India). Single-country for the pilot. */
export const DIAL_CODE = '+91';

/** Local mobile number length (without dial code). */
export const PHONE_LENGTH = 10;
