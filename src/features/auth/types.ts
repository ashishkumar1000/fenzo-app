/**
 * Auth & account-setup domain types for the first-launch sign-up flow.
 *
 * Kept local to the feature; promote to `src/types` only if another feature
 * needs to consume them.
 */

/** The three steps of first-time account setup. */
export type AuthStep = 'phone' | 'otp' | 'profile';

/** Business profile captured in step 3. */
export type BusinessProfile = {
  businessName: string;
  ownerName: string;
  /** One or more business types — maps 1:1 to `serviceCategories` on company setup. */
  businessTypes: string[];
  city: string;
  /** 2-letter ISO 3166-2: IN state code, e.g. "KA" — required by company setup. */
  stateCode: string;
  /** GSTIN — optional; only needed for GST invoices. */
  gstNumber: string;
};

/** What the flow hands back once setup is complete. */

export type AuthResult = {
  phone: string; // E.164-ish, e.g. "+919876543210"
  profile: BusinessProfile;
};
