/**
 * TechniciansScreen — pins what the screen itself owns:
 *
 *  - the `autoOpenAdd` route param (Home's "Add technician" quick action,
 *    product feedback 2026-09-20): the Add sheet is already open on arrival,
 *    a plain push leaves it closed, and once the user closes it a re-render
 *    with identical params must not reopen it — the param is read once as
 *    initial state, so a user-closed sheet stays closed.
 *  - the 20-1 loading-feedback sweep postures (the screen drives the roster
 *    GET because it can be the first consumer after a cold start):
 *    first load with nothing persisted → a labelled roster shimmer, never
 *    a confident "No technicians yet"; a failure with nothing persisted →
 *    the error + "Try again"; a loaded roster → the rows.
 *  - pull-to-refresh drives the handle's `refresh` once per tick (the latch
 *    is a ref); a DOWN refresh still drops the spinner.
 *  - (20-1 review) a failed refresh over live rows says so — the inline
 *    banner above the list, rows intact; and the pull works FROM the
 *    error and empty postures too (the RefreshControl is on every
 *    scrollable posture).

 *
 * `AddTechnicianSheet` is stubbed to a prop-capturing placeholder, and both
 * hooks are mock-driven — their own behaviour is their suites' job
 * (`AddTechnicianSheet.test.tsx`, `useTechnicians.test.tsx`,
 * `useMyProfile.test.tsx`). Renderers unmount at teardown; the suite exits
 * with --forceExit (Jest not exiting is the environment, not a bug).
 */
jest.mock('../components/AddTechnicianSheet', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    AddTechnicianSheet: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'add-technician-sheet', ...props }),
  };
});

jest.mock('../useTechnicians', () => {
  const roster = { technicians: [] as Record<string, unknown>[] };
  return {
    __esModule: true,
    useTechnicians: () => ({
      technicians: roster.technicians,
      hasTechnicians: roster.technicians.length > 0,
      count: roster.technicians.length,
      add: jest.fn(() => Promise.resolve({})),
      remove: jest.fn(),
      refresh: jest.fn(),
      clear: jest.fn(),
    }),
    __roster: roster,
  };
});

jest.mock('../../profile', () => {
  const profile = {
    isLoading: false,
    error: null as string | null,
    refresh: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    useMyProfile: () => ({
      profile: { technicians: [] },
      isLoading: profile.isLoading,
      error: profile.error,
      refresh: profile.refresh,
      dismissError: jest.fn(),
      clear: jest.fn(),
    }),
    __profile: profile,
  };
});

import React from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button, Skeleton } from '../../../components/ui';
import TechniciansScreen from '../TechniciansScreen';

const roster = (
  jest.requireMock('../useTechnicians') as {
    __roster: { technicians: Record<string, unknown>[] };
  }
).__roster;

const profile = (
  jest.requireMock('../../profile') as {
    __profile: { isLoading: boolean; error: string | null; refresh: jest.Mock };
  }
).__profile;

function technician(name: string): Record<string, unknown> {
  return {
    id: `t-${name.toLowerCase()}`,
    name,
    phone: '9876543210',
    status: 'active',
    invitedAt: '2026-09-20T10:00:00Z',
    skillIds: [],
  };
}

const mountedRenderers: ReactTestRenderer[] = [];

function renderScreen(autoOpenAdd?: boolean) {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = {
    key: 'Technicians',
    name: 'Technicians',
    params: autoOpenAdd === undefined ? undefined : { autoOpenAdd },
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <TechniciansScreen navigation={navigation as never} route={route as never} />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, renderer, navigation };
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

function sheetProps(root: ReactTestInstance): Record<string, unknown> {
  return root.findByProps({ testID: 'add-technician-sheet' }).props;
}

describe('the autoOpenAdd param (Home quick action)', () => {
  it('opens the Add sheet on arrival when pushed with autoOpenAdd', () => {
    const { root } = renderScreen(true);

    expect(sheetProps(root).visible).toBe(true);
  });

  it('leaves the sheet closed on a plain push (no params)', () => {
    const { root } = renderScreen();

    expect(sheetProps(root).visible).toBe(false);
  });

  it('treats an explicit autoOpenAdd: false like a plain push', () => {
    const { root } = renderScreen(false);

    expect(sheetProps(root).visible).toBe(false);
  });

  it('does not reopen the sheet on a re-render after the user closed it', () => {
    const { root, renderer } = renderScreen(true);

    act(() => {
      (sheetProps(root).onClose as () => void)();
    });
    expect(sheetProps(root).visible).toBe(false);

    // Re-render with identical params — what the stack serves when this push
    // re-renders. The closed state must survive it.
    act(() => {
      renderer.update(
        <TechniciansScreen
          navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
          route={{ key: 'Technicians', name: 'Technicians', params: { autoOpenAdd: true } } as never}
        />,
      );
    });
    expect(sheetProps(root).visible).toBe(false);
  });

  it('the header Add button still opens the sheet', () => {
    const { root } = renderScreen();

    const add = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Add');
    if (!add) throw new Error('Header Add button not found');

    act(() => {
      add.props.onPress();
    });
    expect(sheetProps(root).visible).toBe(true);
  });
});

describe('the 20-1 loading-feedback postures', () => {
  afterEach(() => {
    roster.technicians.length = 0;
    profile.isLoading = false;
    profile.error = null;
  });

  it('first load with nothing persisted: the labelled roster shimmer — not a confident "no team"', () => {
    profile.isLoading = true;
    const { root } = renderScreen();

    expect(root.findAllByProps({ accessibilityLabel: 'Loading technicians' }).length).toBeGreaterThan(0);
    expect(root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(root.findAll(n => n.props.children === 'No technicians yet').length).toBe(0);
  });

  it('loading WITH a persisted roster: the rows show, no shimmer over them', () => {
    profile.isLoading = true;
    roster.technicians = [technician('Ravi')];
    const { root } = renderScreen();
    const flatList = root.findAllByType(FlatList)[0];

    expect(flatList.props.data).toHaveLength(1);
    expect(root.findAllByType(Skeleton).length).toBe(0);
    expect(root.findAll(n => n.props.children === 'No technicians yet').length).toBe(0);
  });

  it('a failure with nothing persisted: the error view + Try again; Try again re-fetches', async () => {
    profile.error = 'down';
    let release!: (v: void) => void;
    const held = new Promise<void>((res) => { release = res; });
    profile.refresh.mockImplementationOnce(() => held);
    const { root } = renderScreen();

    expect(root.findAllByProps({ message: "Couldn't load your team. Check your connection and try again." }).length).toBeGreaterThan(0);
    const retry = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Try again');
    if (!retry) throw new Error('Try again button not found');
    act(() => {
      retry.props.onPress();
    });
    expect(profile.refresh).toHaveBeenCalledTimes(1);
    release(undefined);
    await act(async () => { await held; });
  });
});

describe('the 20-1 review — failed-refresh and per-posture pull', () => {
  afterEach(() => {
    roster.technicians.length = 0;
    profile.isLoading = false;
    profile.error = null;
  });

  it('a failed refresh over LIVE rows says so: the banner above the list, rows intact', () => {
    roster.technicians = [technician('Ravi'), technician('Sunil')];
    profile.error = 'down';
    const { root } = renderScreen();
    const flatList = root.findAllByType(FlatList)[0];
    expect(root.findAllByProps({ message: "Couldn't refresh your team. Check your connection and try again." }).length).toBeGreaterThan(0);
    expect(flatList.props.data).toHaveLength(2); // rows never get cleared away
  });

  it('loaded rows with NO error carry no banner', () => {
    roster.technicians = [technician('Ravi')];
    profile.error = null;
    const { root } = renderScreen();
    expect(root.findAllByProps({ message: "Couldn't refresh your team. Check your connection and try again." }).length).toBe(0);
  });

  it('the error posture is scrollable: the pull retries from it too', () => {
    profile.error = 'down';
    const { root } = renderScreen();
    expect(root.findAllByType(RefreshControl).length).toBeGreaterThan(0);
  });

  it('the empty posture is scrollable: the pull works from it too', () => {
    const { root } = renderScreen();
    expect(root.findAllByType(RefreshControl).length).toBeGreaterThan(0);
    expect(root.findAll(n => n.props.children === 'No technicians yet').length).toBeGreaterThan(0);
  });
});

describe('the 20-1 pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // the mock's counts must describe THIS pull, not the suite's
  });
  afterEach(() => {
    roster.technicians.length = 0;
    profile.isLoading = false;
    profile.error = null;
  });

  it('a pull drives refresh once and the spinner drops when it settles', async () => {
    roster.technicians = [technician('Ravi'), technician('Anu')];
    let release!: (v: void) => void;
    const held = new Promise<void>((res) => { release = res; });
    profile.refresh.mockImplementationOnce(() => held);
    const { root } = renderScreen();
    const refreshControl = root.findAllByType(RefreshControl)[0];

    act(() => {
      refreshControl.props.onRefresh();
    });
    expect(profile.refresh).toHaveBeenCalledTimes(1);
    expect(refreshControl.props.refreshing).toBe(true);
    release(undefined);
    await act(async () => { await held; });
    expect(refreshControl.props.refreshing).toBe(false);
  });

  it('a same-tick double pull files ONE refresh (the ref latch — no GET stack)', async () => {
    roster.technicians = [technician('Ravi')];
    let release!: (v: void) => void;
    const held = new Promise<void>((res) => { release = res; });
    profile.refresh.mockImplementationOnce(() => held);
    const { root } = renderScreen();
    const refreshControl = root.findAllByType(RefreshControl)[0];

    act(() => {
      refreshControl.props.onRefresh();
      refreshControl.props.onRefresh();
    });
    expect(profile.refresh).toHaveBeenCalledTimes(1);
    release(undefined);
    await act(async () => { await held; });
    expect(refreshControl.props.refreshing).toBe(false);
  });

  it('a DOWN refresh still drops the spinner (a failure never strands the spinner)', async () => {
    roster.technicians = [technician('Ravi')];
    profile.refresh.mockImplementationOnce(() => Promise.reject(new Error('down')));
    const { root } = renderScreen();
    const refreshControl = root.findAllByType(RefreshControl)[0];

    // The failure stays inside the refresh promise (the native pull handles
    // it) — detached from act, which would otherwise rethrow it.
    act(() => {
      void Promise.resolve(refreshControl.props.onRefresh()).catch(() => undefined);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshControl.props.refreshing).toBe(false);
  });
});