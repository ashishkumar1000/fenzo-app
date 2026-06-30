/**
 * Mock "current business" used across Home and More until the real session
 * (from the auth flow's captured BusinessProfile) is wired up.
 * TODO: replace with the persisted profile from `@features/auth` once a
 * session store exists.
 */
export const CURRENT_BUSINESS = {
  ownerName: 'Ravi Kumar',
  ownerRole: 'Owner',
  businessName: 'Cool Air AC Services',
} as const;
