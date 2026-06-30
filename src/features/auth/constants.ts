/**
 * Fixed values for the auth / account-setup flow.
 * No design values here — those live in `src/theme`.
 */

/** Number of OTP digits. */
export const OTP_LENGTH = 6;

/** Seconds before "Resend code" becomes available again. */
export const RESEND_SECONDS = 45;

/** Default dial code (India). Single-country for the pilot. */
export const DIAL_CODE = '+91';

/** Local mobile number length (without dial code). */
export const PHONE_LENGTH = 10;

/** Total steps in the setup flow — drives the 1—2—3 indicator. */
export const TOTAL_STEPS = 3;

/**
 * Business types offered in step 3. Tailored to the small field-service
 * owners Fenzit targets (electricians, plumbers, AC/HVAC, etc.).
 */
export const BUSINESS_TYPES = [
  'AC / HVAC service',
  'Electrical service',
  'Plumbing service',
  'Appliance repair',
  'Pest control',
  'Cleaning service',
  'Carpentry',
  'General maintenance',
  'Other',
] as const;
