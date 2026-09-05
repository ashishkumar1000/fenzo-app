/**
 * The App.tsx 401 composition, end to end (story 5.3): an authenticated
 * request that comes back 401 must flip the auth gate back to the login
 * flow, reset the data stores, and surface the "Session expired" banner on
 * PhoneScreen.
 *
 * The pieces are tested in isolation elsewhere (interceptor dedup in
 * apiClient.test.ts, the registry against real stores in
 * reset-registry-stores.test.tsx, the expiry lifecycle in useAuth.test.tsx).
 * This file is the only place the WIRING is pinned: if the mount effect in
 * App.tsx is deleted or reordered, every one of those suites still passes
 * while the app silently stops force-logging-out on expiry.
 *
 * The nav trees are stubbed to keep the render light and network-free (the
 * signed-in owner tree would fire real screen fetches); the flow is driven
 * through App's own callbacks: complete onboarding → complete auth → a 401
 * through the real apiClient.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { AxiosRequestConfig } from 'axios';

jest.mock('../src/navigation/RootNavigator', () => () => null);
jest.mock('../src/navigation/TechnicianRootNavigator', () => () => null);

// A bare SafeAreaProvider (no native metrics in jest) renders NO children —
// the whole App content would be invisible. Pass children through and pin
// the insets hooks to zeros (the nav trees are stubbed, nothing real reads
// them). The rest of the module stays real.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
    useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
});

import App from '../src/App';
import { apiClient } from '../src/services';
import { AuthFlow } from '../src/features/auth';
import { OnboardingScreen } from '../src/features/onboarding';
import { setAuthToken } from '../src/services/authToken';
import { setProfileFromServer, useMyProfile } from '../src/features/profile/useMyProfile';
import { upsertCustomer, useCustomers } from '../src/features/customers/useCustomers';
import type { ApiCustomer, MyProfile } from '../src/services';

const makeProfile = (overrides: Partial<MyProfile> = {}): MyProfile => ({
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
    serviceCategories: [],
    upiVpa: null,
  },
  technicians: [],
  technicianCount: 0,
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
  ...overrides,
});

const makeCustomer = (overrides: Partial<ApiCustomer> = {}): ApiCustomer => ({
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

/** Adapter that rejects every request with a 401, like a dead session. */
const failWith401 = (config: AxiosRequestConfig) =>
  Promise.reject({
    isAxiosError: true,
    config,
    response: { status: 401, data: { error_code: 'UNAUTHORIZED' } },
  });

/** Post-401 probe: reads the stores a fresh login would inherit. */
let probe: { profile: ReturnType<typeof useMyProfile>; customers: ReturnType<typeof useCustomers> } | null =
  null;
function FreshSessionProbe(): null {
  probe = { profile: useMyProfile(), customers: useCustomers() };
  return null;
}

afterEach(() => {
  apiClient.defaults.adapter = undefined as unknown as NonNullable<
    typeof apiClient.defaults.adapter
  >;
});

it('a 401 flips the auth gate, resets the stores, and shows the expiry banner', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<App />);
  });

  // First launch → complete onboarding → the auth gate (AuthFlow) shows.
  await act(async () => {
    renderer.root.findByType(OnboardingScreen).props.onDone();
  });
  // Sign in through App's own completion callback (the store, not the
  // network): the owner tree mounts.
  await act(async () => {
    renderer.root.findByType(AuthFlow).props.onComplete({ role: 'owner', tenantId: 't1' });
  });
  // Post-login data the next session must NOT inherit (AC 5).
  await act(async () => {
    upsertCustomer(makeCustomer());
    setProfileFromServer(makeProfile());
  });

  // An authenticated request comes back 401.
  apiClient.defaults.adapter = failWith401;
  setAuthToken('real-token');
  await act(async () => {
    await apiClient.get('/jobs').catch(() => {});
  });

  // The gate flipped back to AuthFlow, and the banner explains why.
  renderer.root.findByType(AuthFlow);
  renderer.root.findByProps({ children: 'Session expired — please log in again.' });

  // The stores a fresh login reads start from empty.
  await act(async () => {
    renderer.unmount();
    create(<FreshSessionProbe />);
  });
  expect(probe?.customers.customers).toEqual([]);
  expect(probe?.profile.profile).toBeNull();
});