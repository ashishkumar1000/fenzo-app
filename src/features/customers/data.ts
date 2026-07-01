/**
 * Customer data for the Customers list.
 *
 * `CUSTOMERS` is the live source the screen reads — empty for a new account so
 * the first-run empty state shows. Swap to `SAMPLE_CUSTOMERS` to preview the
 * populated list. Replace with API data later.
 */
import type { Customer } from './types';

/** Live list. Empty until the owner adds customers (or the API is wired up). */
export const CUSTOMERS: Customer[] = [];

export const SAMPLE_CUSTOMERS: Customer[] = [
  { id: 'cust_1', name: 'Priya Sharma', location: 'Andheri West, Mumbai', lifetimeValue: 6400, jobCount: 4 },
  { id: 'cust_2', name: 'Ramesh Kumar', location: 'Bandra West, Mumbai', lifetimeValue: 18900, jobCount: 7 },
  { id: 'cust_3', name: 'Fatima Sheikh', location: 'Bandra West, Mumbai', lifetimeValue: 9200, jobCount: 3 },
  { id: 'cust_4', name: 'Karan Mehta', location: 'Chembur, Mumbai', lifetimeValue: 42500, jobCount: 5 },
  { id: 'cust_5', name: 'Anil Desai', location: 'Powai, Thane', lifetimeValue: 3400, jobCount: 2 },
  { id: 'cust_6', name: 'Sneha Iyer', location: 'Vashi, Navi Mumbai', lifetimeValue: 1400, jobCount: 1 },
];
