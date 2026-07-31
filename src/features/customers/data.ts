/**
 * Customer data for the Customers list.
 *
 * `CUSTOMERS` is the live source the screen reads — empty until the customers
 * API is wired up, so the first-run empty state shows.
 */
import type { Customer } from './types';

/** Live list. Empty until the owner adds customers (or the API is wired up). */
export const CUSTOMERS: Customer[] = [];
