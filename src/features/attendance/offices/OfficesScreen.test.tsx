/**
 * Tests for OfficesScreen (Story 15-4, reshaped to the user-approved sample
 * design 2026-09-28): the segmented All/Active/Archived filter with live
 * counts, the sample card anatomy (icon tile, name + status pill, geofence
 * · hours facts row), the read-only archived rows, and the full-width
 * "Add new office" CTA.
 *
 * Conventions per the other screen suites: the focus hook runs its callback
 * on mount, services are mocked at the barrel, the root getter is read
 * fresh after each flush.
 */
jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock('../../../services', () => ({
  officesService: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    archivePreview: jest.fn(),
    reverseGeocode: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import OfficesScreen from './OfficesScreen';
import { officesService } from '../../../services';
import type { Office } from '../../../types/office';

const listMock = officesService.list as unknown as jest.Mock;

function office(overrides: Partial<Office> = {}): Office {
  return {
    id: 'o1',
    name: 'HQ',
    latitude: 12.97,
    longitude: 77.59,
    radiusM: 100,
    archivedAt: null,
    rule: {
      id: 'r1',
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      validFrom: '2026-09-01',
      validTo: null,
    },
    nextRule: null,
    ...overrides,
  };
}

const HQ = office({ id: 'o1', name: 'HQ' });
const BRANCH = office({
  id: 'o2',
  name: 'Branch',
  latitude: 12.9385,
  longitude: 77.69,
  radiusM: 200,
  rule: null,
});
const OLD = office({
  id: 'o3',
  name: 'Old Depot',
  latitude: 12.9776,
  longitude: 77.7421,
  archivedAt: '2026-09-20T00:00:00Z',
});

type Screen = {
  navigation: Record<string, jest.Mock>;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

function renderScreen(): Screen {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <OfficesScreen
        navigation={navigation as never}
        route={{ params: undefined } as never}
      />,
    );
  });
  return {
    navigation,
    renderer,
    get root() {
      return renderer.root;
    },
  };
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

async function renderLoaded(): Promise<Screen> {
  const screen = renderScreen();
  await act(async () => {
    await flush();
  });
  return screen;
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

/** Text nodes whose flattened string content includes `part` (JSX
 *  interpolation makes children an array — flatten before matching). */
function textContaining(root: ReactTestRenderer.ReactTestInstance, part: string) {
  return root.findAll((n) => {
    if (n.type !== Text) return false;
    const children = n.props.children;
    const flat = Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
    return flat.includes(part);
  });
}

function pressableWithLabel(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  return root.find((n) => n.props?.accessibilityLabel === label);
}

beforeEach(() => {
  jest.resetAllMocks();
  listMock.mockResolvedValue([HQ, BRANCH, OLD]);
});

describe('OfficesScreen — the sample redesign', () => {
  it('renders the segmented filter with live counts', async () => {
    const screen = await renderLoaded();
    expect(pressableWithLabel(screen.root, 'Show all offices (3)')).toBeTruthy();
    expect(pressableWithLabel(screen.root, 'Show active offices (2)')).toBeTruthy();
    expect(pressableWithLabel(screen.root, 'Show archived offices (1)')).toBeTruthy();
  });

  it('cards carry the sample anatomy: pill, geofence · hours · cutoff, coords, valid-from', async () => {
    const screen = await renderLoaded();
    expect(pressableWithLabel(screen.root, 'Office HQ')).toBeTruthy();
    expect(textNodes(screen.root, 'Active').length).toBeGreaterThan(0);
    // Facts row (JSX interpolation makes these children arrays — flatten).
    expect(textContaining(screen.root, '100 m geofence').length).toBe(1);
    expect(textContaining(screen.root, '09:00 – 18:00').length).toBe(1);
    // The late-cutoff chip (amber, from rule.lateCutoffMinutes). Only HQ's
    // card is visible here (archived rows hide behind the disclosure).
    expect(textContaining(screen.root, '15m cutoff').length).toBe(1);
    // The hours chip.
    expect(textNodes(screen.root, '8h full · 4h half').length).toBe(1);
    // Coordinates line + valid-from caption.
    expect(textNodes(screen.root, '12.970° N, 77.590° E').length).toBe(1);
    expect(textContaining(screen.root, 'Valid from').length).toBe(1);
    // An office without a rule shows the honest gap (no chips, no valid-from).
    expect(textNodes(screen.root, 'Timing not set').length).toBe(1);
  });

  it("the All segment hides archived rows behind the disclosure; the Archived segment shows them read-only", async () => {
    const screen = await renderLoaded();
    // All segment: archived rows hidden until disclosed.
    const findArchived = () =>
      screen.root.findAll(
        (n) => n.props?.accessibilityLabel === 'Office Old Depot',
      );
    expect(findArchived().length).toBe(0);

    await act(async () => {
      pressableWithLabel(screen.root, 'Show archived offices').props.onPress();
      await flush();
    });
    expect(findArchived().length).toBeGreaterThan(0);
    expect(textNodes(screen.root, 'Archived').length).toBeGreaterThan(0);

    // The Archived segment: archived rows flat, no disclosure needed.
    await act(async () => {
      pressableWithLabel(screen.root, 'Show archived offices (1)').props.onPress();
      await flush();
    });
    expect(findArchived().length).toBeGreaterThan(0);
    // Active rows are gone in this segment.
    expect(
      screen.root.findAll((n) => n.props?.accessibilityLabel === 'Office HQ').length,
    ).toBe(0);
  });

  it('a row tap opens the edit form with the office id', async () => {
    const screen = await renderLoaded();
    await act(async () => {
      pressableWithLabel(screen.root, 'Office HQ').props.onPress();
    });
    expect(screen.navigation.navigate).toHaveBeenCalledWith('OfficeForm', {
      officeId: 'o1',
    });
  });

  it('the Add-new-office CTA opens the empty form', async () => {
    const screen = await renderLoaded();
    await act(async () => {
      pressableWithLabel(screen.root, 'Add new office').props.onPress();
    });
    expect(screen.navigation.navigate).toHaveBeenCalledWith('OfficeForm', {
      officeId: undefined,
    });
  });

  it('an empty roster shows the invite-first empty state with its own CTA', async () => {
    listMock.mockResolvedValue([]);
    const screen = await renderLoaded();
    expect(textNodes(screen.root, 'No offices yet').length).toBe(1);
  });
});
