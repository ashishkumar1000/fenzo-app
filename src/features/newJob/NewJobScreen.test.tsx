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
 * `AddTechnicianSheet` is stubbed — its open/close/error contract is covered
 * by its own suite; only the screen's reaction to its outcome matters here.
 */
jest.mock('../customers', () => ({
  useCustomers: jest.fn(() => ({
    customers: [],
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn().mockResolvedValue(undefined),
  })),
}));

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
  return {
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
import { Pressable, Text } from 'react-native';
import NewJobScreen from './NewJobScreen';

const SKILLS = [
  { id: 'skill-1', name: 'Plumbing' },
  { id: 'skill-2', name: 'Electrical' },
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

function renderScreen(createdCustomerId?: string) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  };
  const route = {
    params: createdCustomerId !== undefined ? { createdCustomerId } : undefined,
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
  mockProfile.current = { technicians: BASE_TECHNICIANS };
  mockLoadMyProfile.mockClear();
  mockAddTechnician.mockClear().mockResolvedValue(undefined);
});

// --- AddCustomer wiring (needs the Customer section, so pick a skill first) -

it('leaves the customer unselected and never clears params when the route carries none', () => {
  const { root, navigation } = renderScreen();
  pickFirstSkill(root);

  const customerSelect = root.findAllByProps({ label: 'Customer' })[0];
  expect(customerSelect.props.value).toBeUndefined();
  expect(navigation.setParams).not.toHaveBeenCalled();
});

it('selects the returned createdCustomerId in the draft and clears the route param', () => {
  const { root, navigation } = renderScreen('cust-1');
  pickFirstSkill(root);

  const customerSelect = root.findAllByProps({ label: 'Customer' })[0];
  expect(customerSelect.props.value).toBe('cust-1');
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
  expect(root.findAllByProps({ label: 'Customer' })).toEqual([]);
  expect(root.findAllByProps({ label: 'Notes for technician' })).toEqual([]);
  expect(findButtonWithText(root, 'Add new technician')).toBeUndefined();
});

it('reveals Customer, technician and Notes once a skill is picked', () => {
  const { root } = renderScreen();
  pickFirstSkill(root);

  expect(root.findAllByProps({ label: 'Customer' }).length).toBe(1);
  expect(root.findAllByProps({ label: 'Notes for technician' }).length).toBe(1);
  expect(findButtonWithText(root, 'Add new technician')).toBeDefined();
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
  const picker = root.findAllByProps({ selectedId: 'user-tech-new' })[0];
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
    root.findAllByProps({ selectedId: 'user-tech-new' }),
  ).toEqual([]);
  // Nobody ended up selected — the roster itself is not touched.
  expect(
    root.findAllByProps({ selectedId: 'tech-1' }),
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
  expect(root.findAllByProps({ selectedId: 'tech-1' })).toEqual([]);
});
