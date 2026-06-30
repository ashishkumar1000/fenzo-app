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
  businessType: string;
  city: string;
  /** GSTIN — optional; only needed for GST invoices. */
  gstNumber: string;
};

/** What the flow hands back once setup is complete. */
export type AuthResult = {
  phone: string; // E.164-ish, e.g. "+919876543210"
  profile: BusinessProfile;
};
