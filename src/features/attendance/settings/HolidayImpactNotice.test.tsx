/**
 * Tests for HolidayImpactNotice (Story 15-6, FR-20) — the debounced
 * impact-preview banner of the add-holiday sheet.
 *
 * These pin the PREVIEW LIFECYCLE — the 300ms debounce, latest-wins on a
 * date change (both the debounce window and an in-flight request), the
 * date-error gate, and the closed-sheet gate (closed BEFORE a fetch and
 * closed MID-FLIGHT) — plus the over-cap copy introduced by the 15-6
 * review iteration 1 ("…, plus N more employee(s)": the earlier
 * "+N more employees'" dangled a possessive and had no singular), and the
 * AccessibilityInfo announcement of the settled banner.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import HolidayImpactNotice, {
  joinEmployeeNames,
  moreEmployeesSuffix,
} from './HolidayImpactNotice';
import type { HolidayImpactResponse } from '../../../services';

const D1 = '2026-10-20';
const D2 = '2026-10-21';

function employees(...names: string[]) {
  return names.map((name, i) => ({ employeeId: `e${i}`, employeeName: name }));
}

type Props = React.ComponentProps<typeof HolidayImpactNotice>;

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** Advances past the 300ms debounce and settles the response. */
async function runDebounce(ms = 300) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flush();
  });
}

function textMatching(root: ReactTestRenderer.ReactTestInstance, part: string) {
  return root.findAll(
    (n) =>
      n.type === Text &&
      typeof n.props.children === 'string' &&
      n.props.children.includes(part),
  );
}

let announceSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined as never);
});

afterEach(() => {
  announceSpy.mockRestore();
  jest.useRealTimers();
});

describe('HolidayImpactNotice debounce', () => {
  function Harness({
    date,
    impact,
    active = true,
    dateError,
  }: {
    date: string;
    impact: Props['impact'];
    active?: boolean;
    dateError?: string;
  }) {
    return (
      <HolidayImpactNotice
        active={active}
        date={date}
        dateError={dateError}
        impact={impact}
      />
    );
  }

  it('fires nothing before the window elapses, then exactly one call', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(impact).not.toHaveBeenCalled();

    await runDebounce(1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(D1);
    expect(textMatching(renderer.root, 'This date overlaps')).toBeTruthy();
  });

  it('a date change inside the window COALESCES — only the latest date is fetched', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D2,
      affectedEmployees: [],
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });

    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    // The user picks a different date mid-debounce.
    act(() => {
      renderer.update(<Harness date={D2} impact={impact} />);
    });
    await runDebounce(300);

    // One request, for the new date — the old date's fetch never fired.
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(D2);
  });
});

describe('HolidayImpactNotice latest-wins on an in-flight request', () => {
  function Harness({
    date,
    impact,
  }: {
    date: string;
    impact: Props['impact'];
  }) {
    return <HolidayImpactNotice active date={date} impact={impact} />;
  }

  it('a slow EARLIER response cannot land after the date changed', async () => {
    let resolveFirst!: (v: HolidayImpactResponse) => void;
    const impact = jest.fn((date: string): Promise<HolidayImpactResponse> => {
      if (date === D1) {
        return new Promise<HolidayImpactResponse>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        date: D2,
        affectedEmployees: employees('Ann'),
      });
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });
    await runDebounce();
    expect(impact).toHaveBeenCalledWith(D1);

    // The user changes the date; the second preview resolves quickly.
    act(() => {
      renderer.update(<Harness date={D2} impact={impact} />);
    });
    await runDebounce();
    expect(textMatching(renderer.root, "Ann's approved leave")).toBeTruthy();

    // The stale first response resolves LATE, naming employees for the OLD
    // date — it must not overwrite the current banner.
    await act(async () => {
      resolveFirst({ date: D1, affectedEmployees: employees('Zoe') });
      await flush();
    });
    expect(textMatching(renderer.root, "Zoe's approved leave")).toHaveLength(0);
    expect(textMatching(renderer.root, "Ann's approved leave")).toBeTruthy();
  });

  it('a response whose date mismatches the current one is not shown', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });
    await runDebounce();

    // Date changes before the response lands.
    act(() => {
      renderer.update(<Harness date={D2} impact={impact} />);
    });
    await act(async () => {
      await flush();
    });
    // The D1-named banner never shows for D2.
    expect(textMatching(renderer.root, 'This date overlaps')).toHaveLength(0);
  });
});

describe('HolidayImpactNotice gates', () => {
  it('a date error stops the preview and clears any banner', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(
        <HolidayImpactNotice active date={D1} impact={impact} />,
      );
    });
    await runDebounce();
    expect(textMatching(renderer.root, 'This date overlaps')).toBeTruthy();

    act(() => {
      renderer.update(
        <HolidayImpactNotice active date={D1} dateError="Pick a date" impact={impact} />,
      );
    });
    await runDebounce();
    expect(textMatching(renderer.root, 'This date overlaps')).toHaveLength(0);
    expect(impact).toHaveBeenCalledTimes(1); // no refetch while invalid
  });

  it('inactive (closed sheet) fetches nothing and a late response cannot land', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(
        <HolidayImpactNotice active={false} date={D1} impact={impact} />,
      );
    });
    await runDebounce();
    expect(impact).not.toHaveBeenCalled();
    expect(textMatching(renderer.root, 'This date overlaps')).toHaveLength(0);
  });

  it('sheet CLOSED MID-FLIGHT: the in-flight response cannot land and no interim state lingers', async () => {
    // The owner opens the sheet (a fetch starts after the debounce) and
    // closes it before the response arrives — nothing may appear, and the
    // loading state must be dropped (15-6 review iteration 1 test gap).
    let resolveFetch!: (v: HolidayImpactResponse) => void;
    const impact = jest.fn(
      () =>
        new Promise<HolidayImpactResponse>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<HolidayImpactNotice active date={D1} impact={impact} />);
    });
    await runDebounce();
    expect(impact).toHaveBeenCalledTimes(1);

    // Close the sheet while the request is still in the air.
    act(() => {
      renderer.update(
        <HolidayImpactNotice active={false} date={D1} impact={impact} />,
      );
    });
    await act(async () => {
      resolveFetch({ date: D1, affectedEmployees: employees('Ann') });
      await flush();
    });

    expect(textMatching(renderer.root, 'This date overlaps')).toHaveLength(0);
    expect(textMatching(renderer.root, 'Checking impact')).toHaveLength(0);
  });
});

describe('HolidayImpactNotice announcements + over-cap copy', () => {
  function Harness({ date, impact }: { date: string; impact: Props['impact'] }) {
    return <HolidayImpactNotice active date={date} impact={impact} />;
  }

  it('the settled banner is announced via AccessibilityInfo', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });
    expect(announceSpy).not.toHaveBeenCalled(); // nothing before the fetch

    await runDebounce();
    expect(announceSpy).toHaveBeenCalledWith(
      "This date overlaps Ann's approved leave. It will no longer count as leave for them.",
    );
  });

  it('four affected employees singularise the suffix ("plus 1 more employee")', async () => {
    // The old copy had no singular: "+1 more employees'". The suffix is a
    // count-bearing phrase, so 1 must not pluralise.
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann', 'Ben', 'Cara', 'Dev'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });
    await runDebounce();

    const copy = textMatching(renderer.root, 'This date overlaps')[0].props
      .children as string;
    expect(copy).toContain('Ann, Ben and Cara, plus 1 more employee.');
    expect(copy).not.toContain("more employees'");
    expect(copy).toContain('It will no longer count as leave for them.');
  });

  it('five affected employees pluralise the suffix ("plus 2 more employees")', async () => {
    const impact = jest.fn().mockResolvedValue({
      date: D1,
      affectedEmployees: employees('Ann', 'Ben', 'Cara', 'Dev', 'Eve'),
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<Harness date={D1} impact={impact} />);
    });
    await runDebounce();

    const copy = textMatching(renderer.root, 'This date overlaps')[0].props
      .children as string;
    // The old suffix ("+2 more employees'") dangled a possessive with no
    // following noun — the restructured sentence keeps the named group and
    // states the remainder as its own noun phrase.
    expect(copy).toContain('Ann, Ben and Cara, plus 2 more employees.');
    expect(copy).not.toContain('Dev');
    expect(copy).not.toContain('Eve');
  });

  it('moreEmployeesSuffix singularises at exactly 1', () => {
    expect(moreEmployeesSuffix(1)).toBe('plus 1 more employee');
    expect(moreEmployeesSuffix(2)).toBe('plus 2 more employees');
    expect(moreEmployeesSuffix(10)).toBe('plus 10 more employees');
  });
});

describe('joinEmployeeNames', () => {
  it('0/1/2/3+-name forms read as one group phrase', () => {
    expect(joinEmployeeNames([])).toBe('');
    expect(joinEmployeeNames(['Ann'])).toBe('Ann');
    expect(joinEmployeeNames(['Ann', 'Ben'])).toBe('Ann and Ben');
    expect(joinEmployeeNames(['Ann', 'Ben', 'Cara'])).toBe('Ann, Ben and Cara');
  });
});
