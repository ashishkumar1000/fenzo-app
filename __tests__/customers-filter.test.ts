/**
 * `filterCustomers` — the client-side search over the shared customer store
 * (story 2.2, Task 3). Pure functions, no React, no network.
 *
 * The semantics deliberately mirror the backend `GET /customers?q=` filter
 * (name OR phone — see fenzit-be `customers.service.ts`, `sanitizeSearchTerm`),
 * so a later switch to server-side search is invisible to the user. Phone
 * matching uses only the digits of the query, so "81 2345" still matches the
 * stored bare digits — but note the dial-code quirk pinned below: a query
 * like "+91 90000" yields digits "9190000", which no stored number contains.
 */
import { filterCustomers } from '../src/features/customers/format';
import type { Customer } from '../src/features/customers/types';

const make = (overrides: Partial<Customer>): Customer => ({
  id: 'c-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000002',
  address: null,
  city: null,
  jobCount: 0,
  lastJobDate: null,
  ...overrides,
});

const LIST = [
  make({ id: 'c-1', name: 'Ravi Kumar', phoneNumber: '9000000002' }),
  make({ id: 'c-2', name: 'Anita Sharma', phoneNumber: '8123456789' }),
  make({ id: 'c-3', name: 'RAVI TEJA', phoneNumber: '9900110022' }),
];

describe('filterCustomers', () => {
  it('returns the list unchanged for an empty query (after trim)', () => {
    expect(filterCustomers(LIST, '')).toBe(LIST);
    expect(filterCustomers(LIST, '   ')).toBe(LIST);
  });

  it('matches name case-insensitively', () => {
    expect(filterCustomers(LIST, 'ravi').map(c => c.id)).toEqual(['c-1', 'c-3']);
    expect(filterCustomers(LIST, 'SHARMA').map(c => c.id)).toEqual(['c-2']);
  });

  it('matches a phone-digit substring (Task 3: digits of phoneNumber)', () => {
    expect(filterCustomers(LIST, '8123').map(c => c.id)).toEqual(['c-2']);
  });

  it('treats a query whose digits include the dial code as non-matching', () => {
    // Task 3 pins the transform: the WHOLE query's digits ("+91 90000" →
    // "9190000") are matched against the stored bare number, and "9190000"
    // is not a substring of "9000000002". Users type the bare digits; the
    // deliberate dial-code quirk is documented here, not papered over.
    expect(filterCustomers(LIST, '+91 90000')).toEqual([]);
  });

  it('does not match a query with no digits against the phone (name only)', () => {
    // A letter-only query must not match every row via an empty digit string.
    expect(filterCustomers(LIST, 'zzz')).toEqual([]);
  });

  it('matches name and phone case-insensitively on a mixed query', () => {
    // A query with letters AND digits matches name on the raw query, phone on
    // its digits — same row found by either field.
    const list = [make({ id: 'c-9', name: 'Kumar Selvan', phoneNumber: '9000000000' })];
    expect(filterCustomers(list, 'Kumar 9000').map(c => c.id)).toEqual(['c-9']);
  });

  it('returns [] when nothing matches', () => {
    expect(filterCustomers(LIST, 'nope')).toEqual([]);
  });
});