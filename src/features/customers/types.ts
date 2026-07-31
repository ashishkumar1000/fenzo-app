/**
 * Customers domain types.
 * Kept local to the feature; promote to `src/types` once a real API/service
 * backs this list.
 */
import type { ApiCustomer } from '../../services';

/**
 * The list model. Currently identical to the API row — kept as a feature-level
 * alias so screens don't import service types directly, and so a mapping layer
 * can slot in here if the two ever diverge.
 *
 * Note there's no lifetime value and no address: `GET /customers` returns
 * neither.
 */
export type Customer = ApiCustomer;

/**
 * What the "Add customer" sheet collects. Name and phone are required; the
 * rest are optional, so they arrive as trimmed strings that may be empty —
 * the caller decides whether to omit them from the API payload.
 */
export type NewCustomerInput = {
  name: string;
  /** Digits only, no dial code — see `DIAL_CODE` in `constants.ts`. */
  phone: string;
  city: string;
  area: string;
  /** Free-text address or map hint, e.g. "Flat 4B, Sai Krupa, near Metro". */
  address: string;
};
