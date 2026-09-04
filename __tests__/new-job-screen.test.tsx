/**
 * NewJobScreen — the create-success path (Story 1-4 coverage): a successful
 * POST /jobs must drop the row into the jobs store AND force a profile
 * refresh (`loadMyProfile({ force: true })`) so Home's tiles are fresh the
 * moment the owner returns, bypassing the 15s focus throttle.
 *
 * The screen's picker subcomponents and the profile/customers/jobs features
 * are mocked at the module boundary (same pattern as job-detail-screen.test) —
 * the logic under test is the submit flow, not the pickers or the client.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockGoBack = jest.fn();

jest.mock('../src/services', () => ({
  jobService: { create: jest.fn() },
  customerService: { create: jest.fn() },
}));

// NewJobScreen imports the category→service-type translation directly from
// the jobs resource file; mock it so the real apiClient (MMKV-backed) never
// loads.
jest.mock('../src/services/resources/jobs', () => ({
  toJobServiceType: (code: string) => (code === 'plumber' ? 'plumbing' : 'other'),
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

// The three pickers render nothing in this test — their onChange/onSelect
// props are driven directly to fill the draft, so the assertions stay on the
// submit path rather than picker internals.
jest.mock('../src/features/newJob/components/DateTimeFields', () => ({
  DateTimeFields: () => null,
}));
jest.mock('../src/features/newJob/components/ServiceTypePicker', () => ({
  ServiceTypePicker: () => null,
}));
jest.mock('../src/components/TechnicianPicker', () => ({
  TechnicianPicker: () => null,
}));

import NewJobScreen from '../src/features/newJob/NewJobScreen';
import { Button, Select } from '../src/components/ui';
import { jobService } from '../src/services';
import { toJobServiceType } from '../src/services/resources/jobs';
import { loadMyProfile, useMyProfile } from '../src/features/profile';
import { useCustomers, upsertCustomer } from '../src/features/customers';
import { upsertJob } from '../src/features/jobs';
import { ServiceTypePicker } from '../src/features/newJob/components/ServiceTypePicker';
import { TechnicianPicker } from '../src/components/TechnicianPicker';
import type { MyProfile } from '../src/services';

const create = jobService.create as jest.Mock;
const useMyProfileMock = useMyProfile as jest.Mock;
const useCustomersMock = useCustomers as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

function makeProfile(): MyProfile {
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
      serviceCategories: ['plumber'],
      upiVpa: null,
    },
    technicians: [
      {
        id: 'tech-1',
        name: 'Anil Kumar',
        countryCode: '+91',
        phoneNumber: '9000000001',
        status: 'invited',
        skills: ['Plumber'],
        skillIds: ['s-1'],
        createdAt: '2026-09-01T09:00:00Z',
      },
    ],
    technicianCount: 1,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
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

/** Fills the draft via the pickers' own props, then presses Create job. */
async function submitSuccessfulJob(): Promise<ReactTestRenderer.ReactTestRenderer> {
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
    renderer.root.findByType(ServiceTypePicker).props.onChange('plumber');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(Select).props.onChange('c-1');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TechnicianPicker).props.onSelect('tech-1');
  });

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
    profile: makeProfile(),
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
  create.mockResolvedValue({ id: 'j-1', jobNumber: 'JB-2026-0042' });
});

it('a successful create forces a profile refresh so Home tiles are fresh', async () => {
  const renderer = await submitSuccessfulJob();

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      customerId: 'c-1',
      technicianId: 'tech-1',
      serviceType: 'plumbing',
    }),
  );
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