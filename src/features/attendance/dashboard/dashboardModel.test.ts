/**
 * Tests for the dashboard's pure model (Story 19-4, spec §5.3): the tile
 * list (order + a11y pairing + the checked-in pct only on its tile), the
 * strips (each present ONLY at count > 0; a11y with the singular/plural
 * noun tail; details in counts), the sheet copy (title plural on the fake
 * kind; the row date year ALWAYS shown — a flag can come from another
 * calendar year) and the empty-state predicate.
 *
 * QA stance: these pin the requirement's behaviour — boundary counts
 * (0/1/many), malformed dates rendering the raw string, and the
 * cross-year case. If the model changed but the FR-24 contract did not,
 * these must still pass.
 */
import {
  checkedInPct,
  flagRowDate,
  flagRowDetail,
  flagSheetTitle,
  flagStrips,
  isTrackedEmpty,
  kpiTiles,
} from './dashboardModel';

type Counts = {
  tracked: number;
  checkedIn: number;
  notCheckedIn: number;
  shortDay: number;
  late: number;
  onLeave: number;
};

function counts(overrides: Partial<Counts> = {}): Counts {
  return {
    tracked: 9,
    checkedIn: 6,
    notCheckedIn: 2,
    shortDay: 0,
    late: 1,
    onLeave: 1,
    ...overrides,
  };
}

/** A flag row WITHOUT attemptCount (the checkout-missing shape) — fake
 *  locations carry it, per the contract below. */
function flagRow() {
  return { employeeId: 'e1', employeeName: 'Arya', workDate: '2026-09-14', officeName: null };
}

function fakeRow(overrides: Record<string, unknown> = {}) {
  return { ...flagRow(), attemptCount: 1, ...overrides };
}

describe('kpiTiles', () => {
  it('lists the six FR-24 answers in the spec order, labelled', () => {
    const tiles = kpiTiles(counts({ shortDay: 1 }));
    expect(tiles.map(t => [t.key, t.label, t.value])).toEqual([
      ['tracked', 'Tracked', 9],
      ['checkedIn', 'Checked in', 6],
      ['notCheckedIn', 'Not checked in', 2],
      ['shortDay', 'Short day', 1],
      ['late', 'Late', 1],
      ['onLeave', 'On leave', 1],
    ]);
  });

  it('Short day sits right AFTER Not checked in — both answer "who did not make a proper day", but a short day DID punch in', () => {
    const tiles = kpiTiles(counts({ shortDay: 3 }));
    const shortIx = tiles.findIndex(t => t.key === 'shortDay');
    expect(tiles[shortIx - 1].key).toBe('notCheckedIn');
    expect(tiles[shortIx - 1].label).toBe('Not checked in');
    expect(tiles[shortIx + 1].key).toBe('late');
  });

  it('pairs each count into the a11y label ("«Label»: «n»")', () => {
    const zeros = { tracked: 0, checkedIn: 0, notCheckedIn: 0, shortDay: 0, late: 0, onLeave: 0 };
    for (const tile of kpiTiles(zeros)) {
      expect(tile.a11yLabel).toBe(`${tile.label}: ${tile.value}`);
    }
    // A zero still carries its label — zero is an answer, not silence.
    expect(kpiTiles(zeros).find(t => t.key === 'late')!.a11yLabel).toBe('Late: 0');
  });

  it('shows the checked-in share as a pct ONLY on the checkedIn tile', () => {
    const tiles = kpiTiles(counts());
    expect(tiles.find(t => t.key === 'checkedIn')!.pct).toBe(67);
    for (const tile of tiles.filter(t => t.key !== 'checkedIn')) {
      expect(tile.pct).toBeNull();
    }
  });
});

describe('checkedInPct', () => {
  it('rounds to a whole percent', () => {
    expect(checkedInPct(counts({ tracked: 3, checkedIn: 2, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(67);
    expect(checkedInPct(counts({ tracked: 6, checkedIn: 1, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(17);
    expect(checkedInPct(counts({ tracked: 3, checkedIn: 3, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(100);
  });

  it('returns null at tracked 0 — the share has no denominator', () => {
    expect(checkedInPct(counts({ tracked: 0, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBeNull();
  });

  it('flags a share ABOVE 100 as the envelope inconsistency it is', () => {
    // checkedIn > tracked is a broken envelope; the raw share exposes it
    // (PresentCard clamps the render, but the underlying share must stay
    // the raw arithmetic — the clamping lives one layer up).
    expect(checkedInPct(counts({ tracked: 1, checkedIn: 2, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(200);
  });
});

describe('flagStrips', () => {
  it('suppresses BOTH strips at zero — absent, not rendered-and-hidden', () => {
    expect(
      flagStrips({
        checkoutMissing: [] as Array<ReturnType<typeof flagRow>>,
        fakeLocationAttempt: [] as Array<ReturnType<typeof fakeRow>>,
      }),
    ).toEqual([]);
  });

  it('shows checkout-missing alone (fake-location count 0)', () => {
    const strips = flagStrips({
      checkoutMissing: [flagRow(), flagRow()],
      fakeLocationAttempt: [],
    });
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({
      kind: 'checkoutMissing',
      label: 'Checkout missing',
      count: 2,
      a11yLabel: 'Checkout missing, 2 days',
    });
  });

  it('shows both strips when both flags exist, in the contract order', () => {
    const strips = flagStrips({
      checkoutMissing: [flagRow()],
      fakeLocationAttempt: [fakeRow(), fakeRow(), fakeRow()],
    });
    expect(strips.map(s => s.kind)).toEqual(['checkoutMissing', 'fakeLocationAttempt']);
    expect(strips[1]).toMatchObject({
      label: 'Fake location attempt',
      count: 3,
      a11yLabel: 'Fake location attempt, 3 days',
    });
  });

  it('uses the SINGULAR noun tail and detail at count 1 (the boundary)', () => {
    const strips = flagStrips({
      checkoutMissing: [flagRow()],
      fakeLocationAttempt: [fakeRow()],
    });
    expect(strips[0].a11yLabel).toBe('Checkout missing, 1 day');
    expect(strips[0].detail).toBe('No check-out recorded for 1 past day.');
    expect(strips[1].a11yLabel).toBe('Fake location attempt, 1 day');
    expect(strips[1].detail).toBe('GPS spoofing blocked on 1 day.');
  });

  it('the detail line counts DAYS, not devices (the wire has no device identity)', () => {
    const strips = flagStrips({
      checkoutMissing: [flagRow(), flagRow(), flagRow()],
      fakeLocationAttempt: [],
    });
    expect(strips[0].detail).toBe('No check-out recorded for 3 past days.');
  });
});

describe('flagSheetTitle', () => {
  it('names the fake-location kind PLURAL (attempts) but checkout missing plain', () => {
    expect(flagSheetTitle('checkoutMissing')).toBe('Checkout missing');
    expect(flagSheetTitle('fakeLocationAttempt')).toBe('Fake location attempts');
    expect(flagSheetTitle(null)).toBe('');
  });
});

describe('flagRowDate', () => {
  it('renders a full date line with the weekday, day, month name AND year', () => {
    // 2026-09-14 is a Monday — the weekday comes from UTC arithmetic, not
    // the device zone (the model doctrine: never a device-zone Date).
    expect(flagRowDate('2026-09-14')).toBe('Monday, 14 September 2026');
    expect(flagRowDate('2026-01-01')).toBe('Thursday, 1 January 2026');
    expect(flagRowDate('2026-12-31')).toBe('Thursday, 31 December 2026');
  });

  it('keeps the year ALWAYS — a flag from another calendar year must not read as "this year"', () => {
    expect(flagRowDate('2025-03-10')).toBe('Monday, 10 March 2025');
  });

  it('renders malformed dates as the raw string (never invents a date)', () => {
    expect(flagRowDate('2026-9-14')).toBe('2026-9-14');
    expect(flagRowDate('not-a-date')).toBe('not-a-date');
    expect(flagRowDate('')).toBe('');
  });
});

describe('flagRowDetail', () => {
  it('joins date + office + attempts (the fake-location row)', () => {
    expect(
      flagRowDetail({ ...flagRow(), officeName: 'Hero wala', attemptCount: 3 }),
    ).toBe('Monday, 14 September 2026 · Hero wala · 3 attempts');
  });

  it('renders the singular attempt at the 1-attempt boundary', () => {
    expect(
      flagRowDetail({ ...flagRow(), officeName: null, attemptCount: 1 }),
    ).toBe('Monday, 14 September 2026 · 1 attempt');
  });

  it('a checkout-missing row renders date + office, NO attempt count', () => {
    expect(flagRowDetail({ ...flagRow(), officeName: 'Yuka' })).toBe(
      'Monday, 14 September 2026 · Yuka',
    );
  });

  it('a null officeName renders the line WITHOUT an office caption (never "null")', () => {
    expect(flagRowDetail({ ...flagRow(), officeName: null })).toBe(
      'Monday, 14 September 2026',
    );
  });
});

describe('isTrackedEmpty', () => {
  it('is true ONLY at tracked 0 — the empty state is the roster question', () => {
    expect(isTrackedEmpty(counts({ tracked: 0, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(true);
    expect(isTrackedEmpty(counts({ tracked: 1, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0 }))).toBe(false);
    // Today's roster can be all-leave — that is NOT an empty state.
    expect(isTrackedEmpty(counts({ tracked: 3, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 3 }))).toBe(false);
  });
});
