/**
 * NewJobScreen — the create-success path (Story 1-4 coverage): a successful
 * POST /jobs must drop the row into the jobs store AND force a profile
 * refresh (`loadMyProfile({ force: true })`) so Home's tiles are fresh the
 * moment the owner returns, bypassing the 15s focus throttle.
 *
 * Story 5.1 vocabulary: the skill tiles come from the `useSkills` store and
 * the create body carries `skillId` — no `serviceType`, no
 * `requireCompletion*`. Technician matching is exact `skillIds` id
 * membership: only technicians carrying the selected id are offered, a
 * zero-match roster degrades to the full roster behind the existing notice,
 * and a technician who doesn't carry the newly selected skill is cleared.
 *
 * The screen's picker subcomponents and the profile/customers/jobs features
 * are mocked at the module boundary (same pattern as job-detail-screen.test) —
 * the logic under test is the submit flow and the roster filter, not the
 * pickers or the client.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';

const mockGoBack = jest.fn();

jest.mock('../src/services', () => ({
  jobService: { create: jest.fn() },
  customerService: { create: jest.fn() },
}));

jest.mock('../src/features/profile', () => ({
  useMyProfile: jest.fn(),
  loadMyProfile: jest.fn(),
}));

jest.mock('../src/features/customers', () => ({
  AddCustomerSheet: () => null,
  useCustomers: jest.fn(),
  upsertCustomer: jest.fn(),
  DIAL_CODE: '+91',
}));

jest.mock('../src/features/jobs', () => ({
  upsertJob: jest.fn(),
}));

// The skills store drives the tile grid; the screen never talks to the
// network through it in tests.
jest.mock('../src/features/skills', () => ({
  useSkills: jest.fn(),
  loadSkills: jest.fn(),
}));

// The pickers render nothing in this test — their onChange/onSelect props are
// driven directly to fill the draft, so the assertions stay on the submit
// path, the roster filter and the gating rather than picker internals.
jest.mock('../src/features/newJob/components/DateTimeFields', () => ({
  DateTimeFields: () => null,
}));
jest.mock('../src/features/newJob/components/SkillPicker', () => ({
  SkillPicker: () => null,
}));
jest.mock('../src/components/TechnicianPicker', () => ({
  TechnicianPicker: () => null,
}));

import NewJobScreen from '../src/features/newJob/NewJobScreen';
import { Button, Select } from '../src/components/ui';
import { jobService } from '../src/services';
import { loadMyProfile, useMyProfile } from '../src/features/profile';
import { useCustomers, upsertCustomer } from '../src/features/customers';
import { upsertJob } from '../src/features/jobs';
import { useSkills, loadSkills } from '../src/features/skills';
import { SkillPicker } from '../src/features/newJob/components/SkillPicker';
import { TechnicianPicker } from '../src/components/TechnicianPicker';
import type { MyProfile } from '../src/services';

const create = jobService.create as jest.Mock;
const useMyProfileMock = useMyProfile as jest.Mock;
const useCustomersMock = useCustomers as jest.Mock;
const useSkillsMock = useSkills as jest.Mock;
const loadSkillsMock = loadSkills as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

const SKILLS = [
  { id: 'sk-plumb', name: 'Plumbing' },
  { id: 'sk-elec', name: 'Electrical' },
];

function makeProfile(technicians: MyProfile['technicians']): MyProfile {
  return {
    id: 'u-1',
    name: 'Kumar Selvan',
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'active',
    role: 'owner',
    tenant: {
      id: 't-1',
      companyName: 'Fenzit Services',
      gstin: null,
      address: null,
      stateCode: 'TN',
      upiVpa: null,
    },
    technicians,
    technicianCount: technicians.length,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
  };
}

function technician(
  id: string,
  skillIds: string[],
  overrides: Record<string, unknown> = {},
): MyProfile['technicians'][number] {
  return {
    id,
    name: `Tech ${id}`,
    countryCode: '+91',
    phoneNumber: '9000000001',
    status: 'invited',
    skills: [],
    skillIds,
    createdAt: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

const customers = [
  {
    id: 'c-1',
    name: 'Ravi Kumar',
    countryCode: '+91',
    phoneNumber: '9000000002',
    address: '12 Anna Nagar',
    city: 'Chennai',
  },
];

/**
 * Fills the draft via the pickers' own props, then presses Create job.
 * `beforeSubmit` runs after the pickers and before the press — the hook for
 * asserting/driving controls that live in the scroll body.
 */
async function submitSuccessfulJob(
  beforeSubmit?: (renderer: ReactTestRenderer.ReactTestRenderer) => Promise<void>,
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(Select).props.onChange('c-1');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TechnicianPicker).props.onSelect('tech-1');
  });

  if (beforeSubmit) await beforeSubmit(renderer);

  const createButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Create job');
  expect(createButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    createButton!.props.onPress();
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([technician('tech-1', ['sk-plumb'])]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  useCustomersMock.mockReturnValue({
    customers,
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn(),
  });
  useSkillsMock.mockReturnValue({
    skills: SKILLS,
    isLoading: false,
    error: null,
    hasLoaded: true,
    lastLoadedAt: 1,
    refresh: jest.fn(),
  });
  create.mockResolvedValue({ id: 'j-1', jobNumber: 'JB-2026-0042' });
});

it('a successful create forces a profile refresh so Home tiles are fresh', async () => {
  const renderer = await submitSuccessfulJob();

  expect(create).toHaveBeenCalledTimes(1);
  const body = create.mock.calls[0][0];
  expect(body).toMatchObject({
    customerId: 'c-1',
    technicianId: 'tech-1',
    skillId: 'sk-plumb',
  });
  // The old vocabulary is gone from the wire: `skillId` replaced
  // `serviceType`, and the BE strips the completion flags since 4.4.
  expect(body).not.toHaveProperty('serviceType');
  expect(body).not.toHaveProperty('requireCompletionPhoto');
  expect(body).not.toHaveProperty('requireCompletionSignature');
  // The created row lands in the jobs store immediately…
  expect(upsertJob).toHaveBeenCalledTimes(1);
  expect(upsertCustomer).not.toHaveBeenCalled();
  // …and the profile refresh is forced: a throttled no-op would leave Home's
  // tiles stale until the TTL window expired.
  expect(loadMyProfileMock).toHaveBeenCalledTimes(1);
  expect(loadMyProfileMock).toHaveBeenCalledWith({ force: true });
  expect(mockGoBack).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('a failed create does not force a profile refresh', async () => {
  create.mockRejectedValueOnce(
    Object.assign(new Error('Validation failed'), {
      status: 422,
      code: 'VALIDATION',
      message: 'Validation failed',
    }),
  );
  const renderer = await submitSuccessfulJob();

  expect(loadMyProfileMock).not.toHaveBeenCalled();
  expect(mockGoBack).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('the technician picker shows only technicians whose skillIds carry the selected skill', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([
      technician('tech-plumb', ['sk-plumb']),
      technician('tech-elec', ['sk-elec']),
    ]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });

  const offered = renderer.root.findByType(TechnicianPicker).props.technicians;
  expect(offered.map((t: { id: string }) => t.id)).toEqual(['tech-plumb']);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('a zero-match roster degrades to the full roster behind the existing notice', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([
      technician('tech-1', ['sk-elec']),
      technician('tech-2', ['sk-carp']),
    ]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });

  // Full roster offered (advisory fallback — never an empty list)…
  const offered = renderer.root.findByType(TechnicianPicker).props.technicians;
  expect(offered.map((t: { id: string }) => t.id)).toEqual(['tech-1', 'tech-2']);
  // …behind the existing notice.
  const texts = renderer.root.findAllByType(Text);
  expect(
    texts.some(t =>
      typeof t.props.children === 'string' &&
      t.props.children.includes('No technician is tagged with this skill'),
    ),
  ).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('an empty roster keeps the existing add-a-technician state', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });

  const texts = renderer.root.findAllByType(Text);
  expect(
    texts.some(t =>
      typeof t.props.children === 'string' && t.props.children.includes('No technicians yet'),
    ),
  ).toBe(true);
  expect(renderer.root.findAllByType(TechnicianPicker)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('a technician who does not carry the newly selected skill is cleared', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([
      technician('tech-1', ['sk-plumb']),
      technician('tech-2', ['sk-elec']),
    ]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TechnicianPicker).props.onSelect('tech-1');
  });
  expect(renderer.root.findByType(TechnicianPicker).props.selectedId).toBe('tech-1');

  // Switch to Electrical — tech-1 doesn't carry it, so the pairing must go.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-elec');
  });
  expect(renderer.root.findByType(TechnicianPicker).props.selectedId).toBeNull();

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('submission is blocked while no skill is chosen', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  const createButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Create job');
  expect(createButton!.props.disabled).toBe(true);

  // And the technician section shows the gate, not a roster.
  const texts = renderer.root.findAllByType(Text);
  expect(
    texts.some(t =>
      typeof t.props.children === 'string' && t.props.children.includes('Choose a skill first'),
    ),
  ).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

// --- Matrix row 1: tile-section branches fed by the skills store ------------

/** Renders the screen against the current useSkillsMock state. */
async function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });
  return renderer;
}

function hasText(renderer: ReactTestRenderer.ReactTestRenderer, needle: string) {
  return renderer.root
    .findAllByType(Text)
    .some(t => typeof t.props.children === 'string' && t.props.children.includes(needle));
}

it('a skills fetch error with nothing loaded shows the inline error and a working retry', async () => {
  const refreshSkills = jest.fn();
  useSkillsMock.mockReturnValue({
    skills: [],
    isLoading: false,
    error: 'Network request failed',
    hasLoaded: true,
    lastLoadedAt: 1,
    refresh: refreshSkills,
  });

  const renderer = await renderScreen();

  // Inline error, not a blank grid.
  expect(hasText(renderer, 'Network request failed')).toBe(true);
  expect(renderer.root.findAllByType(SkillPicker)).toHaveLength(0);

  const retry = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Try again');
  expect(retry).toBeDefined();
  await ReactTestRenderer.act(async () => {
    retry!.props.onPress();
  });
  expect(refreshSkills).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('an empty catalog after a successful load shows the empty copy, not the picker', async () => {
  useSkillsMock.mockReturnValue({
    skills: [],
    isLoading: false,
    error: null,
    hasLoaded: true,
    lastLoadedAt: 1,
    refresh: jest.fn(),
  });

  const renderer = await renderScreen();

  expect(hasText(renderer, 'No skills are available yet')).toBe(true);
  expect(renderer.root.findAllByType(SkillPicker)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('a first load in flight shows the spinner, not an empty tile grid', async () => {
  useSkillsMock.mockReturnValue({
    skills: [],
    isLoading: true,
    error: null,
    hasLoaded: false,
    lastLoadedAt: null,
    refresh: jest.fn(),
  });

  const renderer = await renderScreen();

  expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByType(SkillPicker)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('loadSkills is called on mount so the tiles fetch on a cold start', async () => {
  const renderer = await renderScreen();

  expect(loadSkillsMock).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('submitting from the advisory fallback roster sends the picked pairing', async () => {
  // Zero technicians carry the selected skill — the picker degrades to the
  // full roster, and the owner's pick from it must reach the create body.
  useMyProfileMock.mockReturnValue({
    profile: makeProfile([
      technician('tech-1', ['sk-elec']),
      technician('tech-2', ['sk-carp']),
    ]),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  await submitSuccessfulJob();

  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({
    skillId: 'sk-plumb',
    technicianId: 'tech-1',
  });
});

it('a profile error with no roster shows the error and a working retry, not the empty-roster copy', async () => {
  const refreshProfile = jest.fn();
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: false,
    error: "Couldn't load your team",
    refresh: refreshProfile,
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  // A skill must be chosen for the roster section to show its degraded state.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });

  expect(hasText(renderer, "Couldn't load your team")).toBe(true);
  expect(hasText(renderer, 'No technicians yet')).toBe(false);
  expect(renderer.root.findAllByType(TechnicianPicker)).toHaveLength(0);

  const retry = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Try again');
  expect(retry).toBeDefined();
  await ReactTestRenderer.act(async () => {
    retry!.props.onPress();
  });
  expect(refreshProfile).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('a loading profile does not show the premature "No technicians yet" copy', async () => {
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: true,
    error: null,
    refresh: jest.fn(),
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(NewJobScreen, {
        navigation: { goBack: mockGoBack, navigate: jest.fn() },
        route: { key: 'NewJob', name: 'NewJob' },
      } as never),
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SkillPicker).props.onChange('sk-plumb');
  });

  expect(hasText(renderer, 'No technicians yet')).toBe(false);
  expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});