/**
 * Display formatters for customer fields. Kept out of the components so the
 * list row and the screen's search filter share one definition of "location".
 */
import type { Customer } from './types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * City and address in one line, skipping whichever is null. Also what search
 * matches on, so the row and the filter can't drift apart.
 *
 * Typed on the fields it uses, not the whole `Customer` — the detail screen
 * (Story 2.1) renders the same location line from `CustomerDetail`, which
 * doesn't carry the list row's job stats.
 */
export function customerLocation(
  customer: Pick<Customer, 'city' | 'address'>,
): string {
  return [customer.city, customer.address].filter(Boolean).join(' · ');
}

/** `+91 6765644658` — dial code and number, single space between. */
export function customerPhone(
  customer: Pick<Customer, 'countryCode' | 'phoneNumber'>,
): string {
  return `${customer.countryCode} ${customer.phoneNumber}`;
}

/**
 * Client-side search over the store list. Deliberately client-side: the store
 * already holds every page (`listAll`), so filtering locally costs nothing and
 * keeps the picker and list in sync — but the semantics mirror the backend
 * `GET /customers?q=` filter (name OR phone — api-contracts.md §12) so a later
 * switch to server-side search is invisible to the user.
 *
 * Phone matching uses only the digits of the query, so a partial number typed
 * with stray punctuation still matches the stored digits-only number.
 */
export function filterCustomers(
  customers: Customer[],
  query: string,
): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  const digits = q.replace(/\D/g, '');
  return customers.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      (digits.length > 0 && c.phoneNumber.includes(digits)),
  );
}

/** `No jobs` / `1 job` / `4 jobs`. */
export function jobCountLabel(count: number): string {
  if (count === 0) return 'No jobs';
  return `${count} ${count === 1 ? 'job' : 'jobs'}`;
}

/**
 * Tile order for the New Job customer picker: the customer the owner most
 * likely wants is the one they served most recently, so `lastJobDate`
 * descending, then name A→Z as the tiebreak (and the fallback when nobody
 * has jobs — a freshly added customer's `lastJobDate` is `null`).
 *
 * Pure and non-mutating: the list screens keep the store's order; only the
 * picker's tiles reorder. An unparseable `lastJobDate` counts as "no job"
 * rather than poisoning the comparator with NaN.
 */
export function sortCustomersByRecency(customers: Customer[]): Customer[] {
  const recency = (iso: string | null): number | null => {
    if (!iso) return null;
    const time = new Date(iso).getTime();
    return Number.isNaN(time) ? null : time;
  };
  return customers.slice().sort((a, b) => {
    const at = recency(a.lastJobDate);
    const bt = recency(b.lastJobDate);
    if (at !== null && bt !== null && at !== bt) return bt - at;
    if ((at === null) !== (bt === null)) return at === null ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * "12 Jun 25" from an ISO timestamp; empty string if unparseable.
 *
 * Formatted by hand rather than via `toLocaleDateString` so the output can't
 * shift with the device locale, or with whether this build of Hermes ships
 * full Intl data.
 */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const year = String(d.getFullYear()).slice(-2);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${year}`;
}
