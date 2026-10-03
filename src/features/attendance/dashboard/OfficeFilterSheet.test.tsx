/**
 * Tests for the OfficeFilterSheet (Story 19-4 redesign, spec §9): the
 * PICK-then-APPLY contract and the postures. The requirements these pin:
 *
 *  - a tap only SETS the draft (nothing commits without Apply);
 *  - Apply commits the draft — an office or null (All offices) — and the
 *    pick carries id + name resolved from the stats (never invented);
 *  - Reset reverts the draft to All-offices and is DISABLED while the
 *    draft is already null;
 *  - every dismissal (onClose: X, drag-down, back) commits NOTHING — the
 *    filter never changes without the button;
 *  - a fresh draft per presentation: a pick from the last presentation
 *    never rides along under Apply after a dismissal;
 *  - stat rows carry real tallies: the "Active" chip only where someone
 *    is actually checked in, and NOTHING is fabricated when stats are
 *    unavailable (the fallback name-only registry renders stat-free);
 *  - fallback postures: Skeleton in flight, InlineError + Retry on
 *    failure with Retry re-fetching, never an empty-list lie;
 *  - zero / one / 15 offices all render — the 15-office case MUST
 *    scroll (a real ScrollView, not a sheet-overflowing column).
 */
jest.mock('../../../services', () => ({
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, InlineError, Skeleton } from '../../../components/ui';
import { officesService } from '../../../services';
import { OfficeFilterSheet } from './OfficeFilterSheet';
import type { DashboardOfficeStat } from '../../../services';

const officesListMock = officesService.list as jest.Mock;

function stats(): DashboardOfficeStat[] {
  return [
    { id: 'o1', name: 'Hero wala', tracked: 3, checkedIn: 2 },
    { id: 'o2', name: 'Yuka', tracked: 0, checkedIn: 0 },
  ];
}

/** The sheet under test — creates its own commit/dismiss jest records. */
function renderSheet(
  props: Partial<React.ComponentProps<typeof OfficeFilterSheet>> = {},
) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  const sheetProps = {
    visible: true,
    selected: null as string | null,
    stats: stats() as DashboardOfficeStat[] | null,
    onPick,
    onClose,
    ...props,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}>
        <OfficeFilterSheet {...sheetProps} />
      </SafeAreaProvider>,
    );
  });
  // The composite under the mirror (renderer.update() would replace the
  // SafeAreaProvider too — re-present tests update the sheet PROPS at the
  // composite, not the whole tree).
  const sheetNode = () => renderer.root.findAllByType(OfficeFilterSheet as never)[0];
  return {
    renderer,
    onPick,
    onClose,
    sheetProps,
    sheet: sheetNode,
  };
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** Tap a row card by its label — the OfficeCard Pressable carries it. */
function pressCard(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  act(() => {
    matches[0].props.onPress();
  });
}

/** The footer buttons — the composite Button lookup idiom (TimeField's
 *  "Done": the composite carries its children string directly). */
function footerButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const matches = renderer.root
    .findAllByType(Button as never)
    .filter(b => b.props.children === label);
  expect(matches).toHaveLength(1);
  return matches[0];
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  mounted.length = 0;
  jest.resetAllMocks();
});

describe('OfficeFilterSheet — the draft contract', () => {
  it('a tap only sets the draft — nothing commits without Apply', () => {
    const hit = renderSheet();
    pressCard(hit.renderer, 'Hero wala');
    // The commit callback has not fired — only Apply may fire it.
    expect(hit.onPick).not.toHaveBeenCalled();
  });

  it('Apply commits the picked card (id + name from the stats)', () => {
    const hit = renderSheet();
    pressCard(hit.renderer, 'Hero wala');
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledTimes(1);
    expect(hit.onPick).toHaveBeenCalledWith({ id: 'o1', name: 'Hero wala' });
  });

  it('Apply commits All-offices (null) while the draft is on All', () => {
    const hit = renderSheet({ selected: 'o2' });
    pressCard(hit.renderer, 'All offices');
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledWith(null);
  });

  it('Reset reverts the draft — the next Apply commits the RESET value, not the pick', () => {
    const hit = renderSheet({ selected: 'o2' });
    pressCard(hit.renderer, 'Hero wala');
    expect(footerButton(hit.renderer, 'Reset').props.disabled).not.toBe(true);
    act(() => {
      footerButton(hit.renderer, 'Reset').props.onPress();
    });
    // Reset disabled once the draft is back to null.
    expect(footerButton(hit.renderer, 'Reset').props.disabled).toBe(true);
    // Apply now commits the reverted draft (All offices) — never the pick.
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledWith(null);
  });

  it('while the draft is already null, Reset is disabled (no double-null tap trap)', () => {
    const hit = renderSheet();
    expect(footerButton(hit.renderer, 'Reset').props.disabled).toBe(true);
  });

  it('a dismissal commits nothing — the filter changes only through Apply', () => {
    const hit = renderSheet();
    pressCard(hit.renderer, 'Hero wala');
    act(() => {
      hit.sheet().props.onClose();
    });
    expect(hit.onPick).not.toHaveBeenCalled();
    expect(hit.onClose).toHaveBeenCalledTimes(1);
  });

  it('a pick from a DISMISSED presentation never survives to the next one', () => {
    // The component re-seeds the draft when `visible` flips back to true
    // (the fresh-draft-per-presentation rule).
    const hit = renderSheet({ selected: null });
    pressCard(hit.renderer, 'Hero wala');

    // Simulate the dismissal + re-presentation cycle the parent drives.
    act(() => {
      hit.sheet().props.onClose();
    });
    let renderer = hit.renderer;
    for (const visible of [false, true]) {
      act(() => {
        renderer.update(
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, width: 0, height: 0 },
              insets: { top: 0, left: 0, right: 0, bottom: 0 },
            }}>
            <OfficeFilterSheet
              visible={visible}
              selected={null}
              stats={stats()}
              onPick={hit.onPick}
              onClose={() => {}}
            />
          </SafeAreaProvider>,
        );
      });
    }
    // Apply WITHOUT a new card tap — only the seeded draft (All offices).
    act(() => {
      footerButton(renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenLastCalledWith(null);
  });

  it('the draft seeds from `selected` (the parent applies the filter, re-present shows it)', () => {
    const hit = renderSheet({ selected: 'o1' });
    // Apply immediately, no tap — the seeded o1 must commit, NOT null.
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledWith({ id: 'o1', name: 'Hero wala' });
  });
});

describe('OfficeFilterSheet — the stat cards', () => {
  it('office rows carry their REAL tallies', () => {
    const hit = renderSheet();
    const shown = texts(hit.renderer);
    expect(shown).toContain('3 tracked · 2 checked in today');
    // The untracked row says so honestly — never a fabricated zero pair.
    expect(shown).toContain('No one is on attendance here today');
  });

  it('the All-offices row aggregates the registry', () => {
    const hit = renderSheet();
    expect(texts(hit.renderer)).toContain(
      '2 locations registered · 2 checked in today',
    );
    // Singular at the one-office boundary.
    const one = renderSheet({
      stats: [{ id: 'o1', name: 'Hero wala', tracked: 1, checkedIn: 0 }],
    });
    expect(texts(one.renderer)).toContain(
      '1 location registered · 0 checked in today',
    );
  });

  it('the Active chip appears ONLY where someone is actually checked in', () => {
    const hit = renderSheet();
    expect(texts(hit.renderer).filter(t => t === 'Active')).toHaveLength(1);
  });

  it('the 15-office tenant renders every office and SCROLLS', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `o${i}`,
      name: `Office ${i + 1}`,
      tracked: i,
      checkedIn: Math.min(i, 2),
    }));
    const hit = renderSheet({ stats: many as unknown as DashboardOfficeStat[] });
    const shown = texts(hit.renderer);
    for (const i of [1, 8, 15]) {
      expect(shown).toContain(`Office ${i}`);
    }
    // The rows live in a scrollable column (the fixed detent stretches it).
    expect(
      hit.renderer.root.findAllByType(ScrollView as never).length,
    ).toBeGreaterThanOrEqual(1);
    // The LAST office is still selectable (reachable, not cut off).
    pressCard(hit.renderer, 'Office 15');
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledWith({ id: 'o14', name: 'Office 15' });
  });
});

describe('OfficeFilterSheet — the fallback (no envelope stats)', () => {
  const office = { id: 'o1', name: 'Hero wala' };

  it('in flight shows the Skeleton', () => {
    officesListMock.mockReturnValue(new Promise(() => {}));
    const hit = renderSheet({ stats: null });
    expect(hit.renderer.root.findAllByType(Skeleton as never).length).toBe(1);
  });

  it('ready shows name-only rows — NOT a fabricated tally, not an "Active" chip', async () => {
    officesListMock.mockResolvedValueOnce([office, { id: 'o2', name: 'Yuka' }]);
    const hit = renderSheet({ stats: null });
    await act(async () => {
      await flush();
    });
    const shown = texts(hit.renderer);
    expect(shown).toContain('Hero wala');
    expect(shown).toContain('Yuka');
    expect(shown.some(t => t.includes('tracked ·'))).toBe(false);
    expect(shown).not.toContain('Active');
  });

  it('failure shows InlineError + Retry — never an empty-looking list', async () => {
    officesListMock.mockRejectedValueOnce(new Error('network down'));
    const hit = renderSheet({ stats: null });
    await act(async () => {
      await flush();
    });
    const shown = texts(hit.renderer);
    expect(shown).toContain(
      "Couldn't load the offices. Check your connection and try again.",
    );
    expect(shown).toContain('Retry');
    expect(shown).not.toContain('No offices yet');
  });

  it('Retry re-fetches the registry', async () => {
    officesListMock.mockRejectedValueOnce(new Error('network down'));
    const hit = renderSheet({ stats: null });
    await act(async () => {
      await flush();
    });
    expect(officesListMock).toHaveBeenCalledTimes(1);
    officesListMock.mockResolvedValueOnce([office]);
    await act(async () => {
      footerButton(hit.renderer, 'Retry').props.onPress();
      await flush();
    });
    expect(officesListMock).toHaveBeenCalledTimes(2);
    expect(texts(hit.renderer)).toContain('Hero wala');
  });

  it('an empty REAL registry renders the guidance line — honestly different from failure', async () => {
    officesListMock.mockResolvedValueOnce([]);
    const hit = renderSheet({ stats: null });
    await act(async () => {
      await flush();
    });
    expect(texts(hit.renderer)).toContain(
      'No offices yet — add one from Attendance offices first.',
    );
  });

  it('Apply with the fallback resolves the name from the registry', async () => {
    officesListMock.mockResolvedValueOnce([office]);
    const hit = renderSheet({ stats: null });
    await act(async () => {
      await flush();
    });
    pressCard(hit.renderer, 'Hero wala');
    act(() => {
      footerButton(hit.renderer, 'Apply Filter').props.onPress();
    });
    expect(hit.onPick).toHaveBeenCalledWith({ id: 'o1', name: 'Hero wala' });
  });
});
