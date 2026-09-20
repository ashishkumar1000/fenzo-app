/**
 * Tests for NewJobScreen's form wiring — the screen-level behaviours whose
 * logic lives here, with the pieces that have their own suites stubbed:
 *
 * 1. AddCustomer wiring — "Add new" pushes the full page with
 *    `returnRouteName: 'NewJob'`, and a `createdCustomerId` returned in route
 *    params (set by `AddCustomerScreen` on a successful save) selects that
 *    customer in the draft and clears the param.
 *
 * 2. Progressive disclosure (product feedback 2026-09-20) — until a skill is
 *    picked only the Skill section renders; Customer, Date & time, Assign
 *    technician and Notes appear once it is chosen.
 *
 * 3. Inline "Add new technician" (product feedback 2026-09-20) — the link
 *    opens the invite sheet; a successful invite forces a profile refresh
 *    (the picker's roster reads `/users/me`, not the local store the invite
 *    writes to) and auto-selects the newcomer when they carry the selected
 *    skill, matched by trimmed phone number; a failed invite refreshes
 *    nothing, so the sheet's stay-open-with-error contract still holds.
 *
 * 4. Select Skills / Select Customers / Select Technicians round trips
 *    (product feedback 2026-09-20) — "Browse all" pushes the full-screen page
 *    carrying the current selection (technicians also carry the job's skill,
 *    read-only context for the browser's "Matches skill" pill); a picked id
 *    or `null` (Clear) returned in route params is applied to the draft and
 *    the param is cleared so it can't re-fire. `undefined` (param absent)
 *    means nothing to apply.
 *
 * 5. Customer section degraded states (product feedback 2026-09-20) — the
 *    section shows a spinner while the first load is in flight, the error
 *    with a working "Try again" when the store failed, and the empty-book
 *    copy when the owner has no customers (the "Add new" link is the way
 *    forward).
 *
 * `AddTechnicianSheet` is stubbed — its open/close/error contract is covered
 * by its own suite; only the screen's reaction to its outcome matters here.
 */
const mockCustomers = {
  current: [] as Array<{
    id: string;
    name: string;
    countryCode: string;
    phoneNumber: string;
    city: string;
    address: string;
    jobCount: number;
    lastJobDate: string | null;
  }>,
  isLoading: false,
  error: null as string | null,
  hasLoaded: true,
};

const mockRefreshCustomers = jest.fn<Promise<void>, []>(() =>
  Promise.resolve(),
);

jest.mock('../customers', () => {
  // The real pure helpers (filterCustomers / sortCustomersByRecency) run —
  // CustomerPicker's search and tile order go through them; the helpers'
  // own suites cover them in depth. Only the store hook is stubbed.
  const actual = jest.requireActual('../customers');
  return {
    ...actual,
    useCustomers: jest.fn(() => ({
      customers: mockCustomers.current,
      isLoading: mockCustomers.isLoading,
      error: mockCustomers.error,
      hasLoaded: mockCustomers.hasLoaded,
      refresh: mockRefreshCustomers,
    })),
  };
});

type ProfileFixture = {
  technicians: Array<{
    id: string;
    name: string;
    countryCode: string;
    phoneNumber: string;
    skillIds: string[];
  }>;
};

const mockProfile = { current: null as ProfileFixture | null };
const mockLoadMyProfile = jest.fn<Promise<void>, [unknown?]>(() =>
  Promise.resolve(),
);

jest.mock('../profile', () => ({
  useMyProfile: jest.fn(() => ({
    profile: mockProfile.current,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  })),
  // Args passed through — the screen's `{ force: true }` refresh after an
  // invite is part of the behaviour under test.
  loadMyProfile: (opts?: unknown) => mockLoadMyProfile(opts),
  getMyProfileSnapshot: () => mockProfile.current,
}));

const mockSkills = { current: [] as Array<{ id: string; name: string }> };

jest.mock('../skills', () => ({
  useSkills: jest.fn(() => ({
    skills: mockSkills.current,
    isLoading: false,
    error: null,
    hasLoaded: true,
    lastLoadedAt: 1,
    refresh: jest.fn(),
  })),
  loadSkills: jest.fn().mockResolvedValue(undefined),
  // SkillPicker renders this per tile; a null glyph keeps the render tree
  // minimal without pulling the real lucide namespace in.
  SkillIcon: () => null,
}));

const mockAddTechnician = jest.fn<Promise<void>, [unknown]>(() =>
  Promise.resolve(),
);

/** The input the stubbed sheet "submits" — padded phone, to pin the trim. */
const MOCK_SHEET_INPUT = {
  name: 'Vel Murugan',
  phone: ' 9123456780 ',
  skillIds: ['skill-1'],
};

jest.mock('../technicians', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  // The real pure helpers (filterTechnicians) run — the feature-local
  // TechnicianPicker's search goes through them. Their behaviour is pinned
  // through the picker and Select-screen suites (no standalone unit file,
  // same discipline as the customers helpers).
  const actual = jest.requireActual('../technicians');
  return {
    ...actual,
    // Renders a single tappable stand-in while open; the real sheet's own
    // suite covers its form, error and dismissal behaviour.
    AddTechnicianSheet: (props: {
      visible: boolean;
      onSubmit: (input: unknown) => Promise<void>;
    }) =>
      props.visible
        ? React.createElement(Pressable, {
            testID: 'add-sheet-submit',
            onPress: () => {
              // `.catch` mirrors the real sheet: a rejection is surfaced in
              // the sheet, never left unhandled.
              props.onSubmit(MOCK_SHEET_INPUT).catch(() => {});
            },
          })
        : null,
    useTechnicians: () => ({ add: mockAddTechnician }),
  };
});

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import NewJobScreen from './NewJobScreen';

const SKILLS = [
  { id: 'skill-1', name: 'Plumbing' },
  { id: 'skill-2', name: 'Electrical' },
];

const CUSTOMERS = [
  {
    id: 'cust-1',
    name: 'Priya Sharma',
    countryCode: '+91',
    phoneNumber: '9000000001',
    city: 'Chennai',
    address: '12 Beach Rd',
    jobCount: 3,
    lastJobDate: '2026-09-19T10:00:00Z',
  },
  {
    id: 'cust-2',
    name: 'Arun V',
    countryCode: '+91',
    phoneNumber: '9000000002',
    city: 'Chennai',
    address: '',
    jobCount: 1,
    lastJobDate: null,
  },
];

const BASE_TECHNICIANS = [
  {
    id: 'tech-1',
    name: 'Ravi Kumar',
    countryCode: '+91',
    phoneNumber: '9000000000',
    skillIds: ['skill-1'],
  },
];

function renderScreen(
  createdCustomerId?: string,
  extraParams?: Record<string, unknown>,
) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  };
  const route = {
    params: {
      ...(createdCustomerId !== undefined ? { createdCustomerId } : {}),
      ...extraParams,
    },
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <NewJobScreen navigation={navigation as never} route={route as never} />,
    );
  });
  return { root: renderer.root, navigation, route };
}

/** Selects the first skill tile — the gate for the rest of the form. */
function pickFirstSkill(root: ReactTestRenderer.ReactTestInstance) {
  const tile = root.findAllByProps({
    accessibilityRole: 'button',
    accessibilityLabel: 'Plumbing',
  })[0];
  act(() => {
    tile.props.onPress();
  });
}

/** The accessibility state of the named customer's picker tile. */
function customerTileState(
  root: ReactTestRenderer.ReactTestInstance,
  name: string,
) {
  return (
    root
      .findAllByProps({ accessibilityLabel: name })
      .filter(t => t.props.accessibilityState !== undefined)[0]?.props
      .accessibilityState ?? null
  );
}

/** The accessibility state of the named technician's picker tile. */
function technicianTileState(
  root: ReactTestRenderer.ReactTestInstance,
  name: string,
) {
  return (
    root
      .findAllByProps({ accessibilityLabel: name })
      .filter(t => t.props.accessibilityState !== undefined)[0]?.props
      .accessibilityState ?? null
  );
}

function findButtonWithText(
  root: ReactTestRenderer.ReactTestInstance,
  text: string,
) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(instance =>
      instance
        .findAllByType(Text)
        .some(t => typeof t.props.children === 'string' && t.props.children === text),
    );
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root
    .findAllByType(Text)
    .some(t => typeof t.props.children === 'string' && t.props.children.includes(text));
}

beforeEach(() => {
  mockSkills.current = SKILLS;
  mockCustomers.current = CUSTOMERS;
  mockCustomers.isLoading = false;
  mockCustomers.error = null;
  mockCustomers.hasLoaded = true;
  mockProfile.current = { technicians: BASE_TECHNICIANS };
  mockLoadMyProfile.mockClear();
  mockRefreshCustomers.mockClear();
  mockAddTechnician.mockClear().mockResolvedValue(undefined);
});

// --- AddCustomer wiring (needs the Customer section, so pick a skill first) -

it('leaves the customer unselected and never clears params when the route carries none', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  expect(customerTileState(root, 'Priya Sharma')).toEqual({ selected: false });
  expect(navigation.setParams).not.toHaveBeenCalled();
});

it('selects the returned createdCustomerId in the draft and clears the route param', () => {
  const { root, navigation } = renderScreen('cust-1');
  pickFirstSkill(root);

  expect(customerTileState(root, 'Priya Sharma')).toEqual({ selected: true });
  expect(navigation.setParams).toHaveBeenCalledWith({ createdCustomerId: undefined });
});

it('"Add new" pushes AddCustomer with this screen as the return route', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  const addCustomerLink = findButtonWithText(root, 'Customer not in list? Add new');

  act(() => {
    addCustomerLink?.props.onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('AddCustomer', {
    returnRouteName: 'NewJob',
  });
});

// --- Progressive disclosure -------------------------------------------------

it('shows only the Skill section until a skill is picked', () => {
  const { root } = renderScreen();

  // RN's Pressable renders several tree nodes carrying the same props —
  // count the visible tile, not the wrappers.
  expect(
    root.findAllByProps({ accessibilityLabel: 'Plumbing' }).length,
  ).toBeGreaterThan(0);
  expect(root.findAllByProps({ accessibilityLabel: 'Browse all customers' })).toEqual([]);
  expect(root.findAllByProps({ accessibilityLabel: 'Notes for technician' })).toEqual([]);
  // No section heads either — the only visible section (Skill) names itself
  // inline in the picker header.
  expect(root.findAllByProps({ accessibilityRole: 'header' })).toEqual([]);
  expect(root.findAllByProps({ testID: 'section-divider' })).toEqual([]);
  expect(findButtonWithText(root, 'Add new technician')).toBeUndefined();
});

it('reveals Customer, technician and Notes once a skill is picked', () => {
  const { root } = renderScreen();
  pickFirstSkill(root);

  expect(root.findAllByProps({ accessibilityLabel: 'Browse all customers' }).length).toBeGreaterThan(0);
  // RN mirrors accessibilityLabel onto host wrapper nodes — count the
  // presence, not exactly one node.
  expect(
    root.findAllByProps({ accessibilityLabel: 'Notes for technician' }).length,
  ).toBeGreaterThan(0);
  expect(findButtonWithText(root, 'Add new technician')).toBeDefined();
});

it('separates the sections: eyebrows for the form fields, inline titles for the pickers', () => {
  const { root } = renderScreen();
  pickFirstSkill(root);

  // The eyebrows, by their header role — an exact set, so a re-added field
  // label or a dropped section head cannot slip through. "Skill", "Customer"
  // and "Technician" name themselves inline in their picker headers
  // (title + count chip + Browse all on one line) instead of an eyebrow.
  const names = [
    ...new Set(
      root
        .findAllByProps({ accessibilityRole: 'header' })
        .map(t => t.props.children),
    ),
  ];
  expect(names).toEqual(['Date & time', 'Notes for technician']);
  // One hairline per eyebrow — RN mirrors the testID onto the host wrapper,
  // doubling the node count; assert the floor, not the doubled exact count.
  expect(
    root.findAllByProps({ testID: 'section-divider' }).length,
  ).toBeGreaterThanOrEqual(2);
  // The picker sections carry their names inline instead.
  expect(root.findAllByProps({ title: 'Customer' }).length).toBe(1);
  expect(root.findAllByProps({ title: 'Technician' }).length).toBe(1);
});

// --- Inline "Add new technician" --------------------------------------------

it('opens the invite sheet from the technician section link', () => {
  const { root } = renderScreen();
  pickFirstSkill(root);

  expect(root.findAllByProps({ testID: 'add-sheet-submit' })).toEqual([]);

  act(() => {
    findButtonWithText(root, 'Add new technician')?.props.onPress();
  });

  expect(
    root.findAllByProps({ testID: 'add-sheet-submit' }).length,
  ).toBeGreaterThan(0);
});

it('invites, forces a profile refresh, and auto-selects the newcomer who carries the skill', async () => {
  // The forced refresh lands a roster that includes the just-invited
  // technician — matched by trimmed phone number, never by the invite id.
  mockLoadMyProfile.mockImplementation(async () => {
    mockProfile.current = {
      technicians: [
        ...BASE_TECHNICIANS,
        {
          id: 'user-tech-new',
          name: 'Vel Murugan',
          countryCode: '+91',
          phoneNumber: '9123456780',
          skillIds: ['skill-1'],
        },
      ],
    };
  });

  const { root } = renderScreen();
  pickFirstSkill(root);

  act(() => {
    findButtonWithText(root, 'Add new technician')?.props.onPress();
  });
  await act(async () => {
    root.findAllByProps({ testID: 'add-sheet-submit' })[0].props.onPress();
  });

  expect(mockAddTechnician).toHaveBeenCalledWith(MOCK_SHEET_INPUT);
  expect(mockLoadMyProfile).toHaveBeenCalledWith({ force: true });
  const picker = root.findAllByProps({ value: 'user-tech-new' })[0];
  expect(picker).toBeDefined();
});

it('does not auto-select a newcomer whose skills exclude the picked skill', async () => {
  mockLoadMyProfile.mockImplementation(async () => {
    mockProfile.current = {
      technicians: [
        ...BASE_TECHNICIANS,
        {
          id: 'user-tech-new',
          name: 'Vel Murugan',
          countryCode: '+91',
          phoneNumber: '9123456780',
          skillIds: ['skill-2'],
        },
      ],
    };
  });

  const { root } = renderScreen();
  pickFirstSkill(root);

  act(() => {
    findButtonWithText(root, 'Add new technician')?.props.onPress();
  });
  await act(async () => {
    root.findAllByProps({ testID: 'add-sheet-submit' })[0].props.onPress();
  });

  expect(
    root.findAllByProps({ value: 'user-tech-new' }),
  ).toEqual([]);
  // Nobody ended up selected — the roster itself is not touched.
  expect(
    root.findAllByProps({ value: 'tech-1' }),
  ).toEqual([]);
});

it('refreshes nothing when the invite fails — the sheet keeps its error state', async () => {
  mockAddTechnician.mockRejectedValueOnce(new Error('duplicate phone'));

  const { root } = renderScreen();
  pickFirstSkill(root);

  act(() => {
    findButtonWithText(root, 'Add new technician')?.props.onPress();
  });
  await act(async () => {
    root.findAllByProps({ testID: 'add-sheet-submit' })[0].props.onPress();
  });

  expect(mockLoadMyProfile).not.toHaveBeenCalled();
});

it('degrades silently when the fresh roster does not carry the newcomer', async () => {
  // `loadMyProfile` never rejects — a failed refresh retains the stale
  // roster in the store. The handler then resolves with nothing selected
  // and the sheet closes; the newcomer becomes visible on the next focus
  // refresh. This pins that degradation so a future refactor that makes the
  // store propagate errors cannot turn it into a stuck sheet unnoticed.
  mockLoadMyProfile.mockImplementation(async () => {
    // Roster deliberately unchanged: the refresh "landed" without the
    // just-invited technician (replication lag, stale cache).
  });

  const { root } = renderScreen();
  pickFirstSkill(root);

  act(() => {
    findButtonWithText(root, 'Add new technician')?.props.onPress();
  });
  // A rejection here would fail the test — the handler must always resolve.
  await act(async () => {
    root.findAllByProps({ testID: 'add-sheet-submit' })[0].props.onPress();
  });

  expect(mockAddTechnician).toHaveBeenCalledWith(MOCK_SHEET_INPUT);
  expect(mockLoadMyProfile).toHaveBeenCalledWith({ force: true });
  // Nobody selected — the pre-invite roster is untouched.
  expect(root.findAllByProps({ value: 'tech-1' })).toEqual([]);
});

// --- Select Skills round trip ------------------------------------------------

it('"Browse all" pushes SelectSkills carrying the current selection', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Browse all skills' })[0].props
      .onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('SelectSkills', {
    selectedSkillId: 'skill-1',
  });
});

it('applies the skill returned by SelectSkills and clears the param', () => {
  const { root, navigation } = renderScreen(undefined, {
    selectedSkillId: 'skill-2',
  });

  // The returned pick gates the rest of the form and marks its tile.
  expect(
    root
      .findAllByProps({ accessibilityLabel: 'Electrical' })
      .filter(t => t.props.accessibilityState !== undefined)[0]?.props
      .accessibilityState,
  ).toEqual({ selected: true });
  // Cleared immediately so a later re-render can't re-apply it.
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedSkillId: undefined,
  });
});

it('collapses the form when SelectSkills returns an empty selection (Clear)', () => {
  const { root, navigation } = renderScreen(undefined, {
    selectedSkillId: null,
  });

  // `null` is a decision — the skill (and any technician needing it) is
  // dropped and the form re-collapses to just the Skill section.
  expect(root.findAllByProps({ accessibilityLabel: 'Browse all customers' })).toEqual([]);
  expect(root.findAllByProps({ accessibilityLabel: 'Notes for technician' })).toEqual([]);
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedSkillId: undefined,
  });
});

it('does nothing when no SelectSkills result is in the route params', () => {
  const { navigation } = renderScreen();
  expect(navigation.setParams).not.toHaveBeenCalled();
});

// --- Select Customers round trip ---------------------------------------------

it('"Browse all" pushes SelectCustomers carrying the current selection', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  // Pick Priya first, so the handoff carries a real selection rather than
  // the null the form starts with.
  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Priya Sharma' })[0].props.onPress();
  });
  act(() => {
    root
      .findAllByProps({ accessibilityLabel: 'Browse all customers' })[0]
      .props.onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('SelectCustomers', {
    selectedCustomerId: 'cust-1',
  });
});

it('applies the customer returned by SelectCustomers and clears the param', () => {
  const { root, navigation } = renderScreen(undefined, {
    selectedCustomerId: 'cust-1',
  });

  // The param applies on mount; the section itself only renders once a
  // skill is picked (progressive disclosure).
  pickFirstSkill(root);
  expect(customerTileState(root, 'Priya Sharma')).toEqual({ selected: true });
  // Cleared immediately so a later re-render can't re-apply it.
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedCustomerId: undefined,
  });
});

it('drops the customer when SelectCustomers returns an empty selection (Clear)', () => {
  // createdCustomerId picks Priya first; the Clear return (`null`) then
  // drops her — the tiles stay up with nothing selected, and a job can't
  // be submitted without a customer.
  const { root, navigation } = renderScreen('cust-1', {
    selectedCustomerId: null,
  });

  pickFirstSkill(root);
  expect(customerTileState(root, 'Priya Sharma')).toEqual({
    selected: false,
  });
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedCustomerId: undefined,
  });
});

// --- Select Technicians round trip -------------------------------------------

it('"Browse all" pushes SelectTechnicians carrying the current selection and skill', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  // Pick Ravi first, so the handoff carries a real selection rather than
  // the null the form starts with.
  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Ravi Kumar' })[0].props.onPress();
  });
  act(() => {
    root
      .findAllByProps({ accessibilityLabel: 'Browse all technicians' })[0]
      .props.onPress();
  });

  // The skill rides along as read-only context — it drives the browser's
  // "Matches skill" pill, never a filter.
  expect(navigation.navigate).toHaveBeenCalledWith('SelectTechnicians', {
    selectedTechnicianId: 'tech-1',
    skillId: 'skill-1',
  });
});

it('applies the technician returned by SelectTechnicians and clears the param', () => {
  const { root, navigation } = renderScreen(undefined, {
    selectedTechnicianId: 'tech-1',
  });

  // The param applies on mount; the section itself only renders once a
  // skill is picked (progressive disclosure).
  pickFirstSkill(root);
  expect(technicianTileState(root, 'Ravi Kumar')).toEqual({ selected: true });
  // Cleared immediately so a later re-render can't re-apply it.
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedTechnicianId: undefined,
  });
});

it('drops the technician when SelectTechnicians returns a null selection (Clear)', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <NewJobScreen
        navigation={navigation as never}
        route={{ params: { selectedTechnicianId: 'tech-1' } } as never}
      />,
    );
  });
  pickFirstSkill(renderer.root);
  expect(technicianTileState(renderer.root, 'Ravi Kumar')).toEqual({
    selected: true,
  });

  // Clear comes back with `null` — a decision the caller reacts to: the
  // assignment drops and the tiles stay up with nothing selected.
  act(() => {
    renderer.update(
      <NewJobScreen
        navigation={navigation as never}
        route={{ params: { selectedTechnicianId: null } } as never}
      />,
    );
  });

  expect(technicianTileState(renderer.root, 'Ravi Kumar')).toEqual({
    selected: false,
  });
  expect(navigation.setParams).toHaveBeenCalledWith({
    selectedTechnicianId: undefined,
  });
  renderer.unmount();
});

// --- Customer section degraded states ----------------------------------------

it('shows a spinner for the customer section while the first load is in flight', () => {
  mockCustomers.current = [];
  mockCustomers.isLoading = true;
  mockCustomers.hasLoaded = false;

  const { root } = renderScreen();
  pickFirstSkill(root);

  // No tiles and no premature empty-book copy — just the spinner.
  expect(customerTileState(root, 'Priya Sharma')).toBeNull();
  expect(hasText(root, 'No customers yet')).toBe(false);
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
});

it('shows the customer error with a working "Try again" when the store failed', () => {
  mockCustomers.current = [];
  mockCustomers.error = 'Customers failed to load';
  mockCustomers.hasLoaded = false;

  const { root } = renderScreen();
  pickFirstSkill(root);

  expect(hasText(root, 'Customers failed to load')).toBe(true);
  // DS Button exposes no accessibilityRole — match on the label instead.
  const retry = root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node =>
      node.findAllByType(Text).some(t => t.props.children === 'Try again'),
    );
  expect(retry).toBeDefined();
  act(() => {
    retry?.props.onPress();
  });
  expect(mockRefreshCustomers).toHaveBeenCalled();
});

it('shows the empty-book copy when the owner has no customers yet', () => {
  mockCustomers.current = [];
  mockCustomers.hasLoaded = true;

  const { root } = renderScreen();
  pickFirstSkill(root);

  expect(hasText(root, 'No customers yet')).toBe(true);
  // The Add-new link stays up as the way forward from here.
  expect(hasText(root, 'Customer not in list? Add new')).toBe(true);
});
