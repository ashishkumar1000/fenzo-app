/**
 * `sortCustomersByRecency` — the New Job customer tiles' order (story 11-7).
 * Pure function, no React, no network.
 *
 * The tile the owner most likely wants is the customer they served most
 * recently, so `lastJobDate` descending with a name tiebreak. Rows without a
 * usable `lastJobDate` (null or unparseable — a freshly created customer's
 * derived field defaults to null) sort after everyone with a date, by name.
 */
import { sortCustomersByRecency } from '../src/features/customers/format';
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

describe('sortCustomersByRecency', () => {
  it('does not mutate the input list', () => {
    const list = [make({ id: 'a', name: 'B' }), make({ id: 'b', name: 'A' })];
    const snapshot = [...list];
    sortCustomersByRecency(list);
    expect(list).toEqual(snapshot);
  });

  it('orders by lastJobDate descending', () => {
    const sorted = sortCustomersByRecency([
      make({ id: 'old', lastJobDate: '2026-09-01T10:00:00Z' }),
      make({ id: 'new', lastJobDate: '2026-09-19T10:00:00Z' }),
      make({ id: 'mid', lastJobDate: '2026-09-10T10:00:00Z' }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks recency ties by name A→Z', () => {
    const sorted = sortCustomersByRecency([
      make({ id: 'b', name: 'Bala', lastJobDate: '2026-09-10T10:00:00Z' }),
      make({ id: 'a', name: 'Anita', lastJobDate: '2026-09-10T10:00:00Z' }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('sorts customers without a lastJobDate after everyone with one, by name', () => {
    const sorted = sortCustomersByRecency([
      make({ id: 'z', name: 'Zoya', lastJobDate: null }),
      make({ id: 'old', name: 'Old', lastJobDate: '2026-08-01T10:00:00Z' }),
      make({ id: 'a', name: 'Anita', lastJobDate: null }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['old', 'a', 'z']);
  });

  it('falls back to name when nobody has a lastJobDate', () => {
    const sorted = sortCustomersByRecency([
      make({ id: 'b', name: 'bala' }),
      make({ id: 'a', name: 'Anita' }),
      make({ id: 'c', name: 'CHANDRA' }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('treats an unparseable lastJobDate as "no job", not NaN', () => {
    // A NaN comparator result is engine-dependent sort behaviour — the guard
    // must route a corrupt date into the null bucket instead, ordered by
    // name alongside the genuinely null rows.
    const sorted = sortCustomersByRecency([
      make({ id: 'bad', name: 'Bad Date', lastJobDate: 'not-a-date' }),
      make({ id: 'good', name: 'Good Date', lastJobDate: '2026-09-01T10:00:00Z' }),
      make({ id: 'none', name: 'No Date', lastJobDate: null }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['good', 'bad', 'none']);
  });

  it('returns the same order for an empty or single-row list', () => {
    expect(sortCustomersByRecency([])).toEqual([]);
    const single = [make({ id: 'only' })];
    expect(sortCustomersByRecency(single)).toHaveLength(1);
  });
});
