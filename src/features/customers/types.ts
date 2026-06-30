/**
 * Customers domain types.
 * Kept local to the feature; promote to `src/types` once a real API/service
 * backs this list.
 */
export type Customer = {
  id: string;
  name: string;
  location: string;
  /** Lifetime value across all jobs, in rupees. */
  lifetimeValue: number;
  jobCount: number;
};
