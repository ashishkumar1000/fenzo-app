/**
 * Fixed values for the auth / account-setup flow.
 * No design values here — those live in `src/theme`.
 */

/** Number of OTP digits. */
export const OTP_LENGTH = 6;

/** Seconds before "Resend code" becomes available again. */
export const RESEND_SECONDS = 45;

/** Re-exported app-wide, so every feature agrees on them. */
export { DIAL_CODE, PHONE_LENGTH } from '../../constants/phone';

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

/**
 * Maps each `BUSINESS_TYPES` label to the machine-readable service-category
 * code the company-setup API expects (`serviceCategories: string[]`).
 *
 * ⚠️ ASSUMPTION: the backend docs only give two example codes (`ac_technician`,
 * `pest_control`) and don't enumerate the full set. The rest below is a
 * reasonable snake_case guess following that pattern — confirm against the
 * actual backend enum before relying on this for anything beyond the pilot,
 * and update this table if any code doesn't match.
 */
export const SERVICE_CATEGORY_BY_BUSINESS_TYPE: Record<(typeof BUSINESS_TYPES)[number], string> = {
  'AC / HVAC service': 'ac_technician',
  'Electrical service': 'electrician',
  'Plumbing service': 'plumber',
  'Appliance repair': 'appliance_repair',
  'Pest control': 'pest_control',
  'Cleaning service': 'cleaning',
  'Carpentry': 'carpentry',
  'General maintenance': 'general_maintenance',
  'Other': 'other',
};

/**
 * India states and union territories, ISO 3166-2: IN codes — for the required
 * `stateCode` field on company setup. `{ value, label }` pairs for the
 * `Select` component (value = the 2-letter code sent to the API).
 */
export const INDIA_STATES = [
  { value: 'AN', label: 'Andaman and Nicobar Islands' },
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'AR', label: 'Arunachal Pradesh' },
  { value: 'AS', label: 'Assam' },
  { value: 'BR', label: 'Bihar' },
  { value: 'CH', label: 'Chandigarh' },
  { value: 'CT', label: 'Chhattisgarh' },
  { value: 'DN', label: 'Dadra and Nagar Haveli and Daman and Diu' },
  { value: 'DL', label: 'Delhi' },
  { value: 'GA', label: 'Goa' },
  { value: 'GJ', label: 'Gujarat' },
  { value: 'HR', label: 'Haryana' },
  { value: 'HP', label: 'Himachal Pradesh' },
  { value: 'JK', label: 'Jammu and Kashmir' },
  { value: 'JH', label: 'Jharkhand' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'KL', label: 'Kerala' },
  { value: 'LA', label: 'Ladakh' },
  { value: 'LD', label: 'Lakshadweep' },
  { value: 'MP', label: 'Madhya Pradesh' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'MN', label: 'Manipur' },
  { value: 'ML', label: 'Meghalaya' },
  { value: 'MZ', label: 'Mizoram' },
  { value: 'NL', label: 'Nagaland' },
  { value: 'OR', label: 'Odisha' },
  { value: 'PY', label: 'Puducherry' },
  { value: 'PB', label: 'Punjab' },
  { value: 'RJ', label: 'Rajasthan' },
  { value: 'SK', label: 'Sikkim' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TG', label: 'Telangana' },
  { value: 'TR', label: 'Tripura' },
  { value: 'UP', label: 'Uttar Pradesh' },
  { value: 'UT', label: 'Uttarakhand' },
  { value: 'WB', label: 'West Bengal' },
] as const;
