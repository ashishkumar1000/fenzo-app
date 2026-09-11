/**
 * AuthFlow step-3 company-setup wiring (Story 5.1 matrix row 9): the
 * `setupCompany` payload must NOT carry `serviceCategories` (the old
 * business-type → category mapping is gone), while the pre-existing
 * ≥1-business-type validation still blocks an empty selection before any
 * request goes out.
 *
 * The step screens are mocked at the module boundary and driven through
 * their props (same pattern as `__tests__/new-job-screen.test.tsx`), so the
 * assertions stay on the submit payload and validation rather than the
 * screens' internals. `authApi` is mocked at the services barrel.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../../services', () => ({
  authApi: {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    setupCompany: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

jest.mock('./useAuth', () => ({
  useSessionExpired: jest.fn(() => false),
  clearSessionExpired: jest.fn(),
}));

jest.mock('./screens/PhoneScreen', () => ({ PhoneScreen: () => null }));
jest.mock('./screens/OtpScreen', () => ({ OtpScreen: () => null }));
jest.mock('./screens/ProfileScreen', () => ({ ProfileScreen: () => null }));

import AuthFlow from './AuthFlow';
import { authApi } from '../../services';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';

const sendOtp = authApi.sendOtp as jest.Mock;
const verifyOtp = authApi.verifyOtp as jest.Mock;
const setupCompany = authApi.setupCompany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  sendOtp.mockResolvedValue({ otp_session_id: 'sess-1' });
  verifyOtp.mockResolvedValue({
    token: 'token-1',
    user: { userId: 'u-1', tenantId: null, role: 'owner', name: null },
  });
});

/**
 * Walks AuthFlow to step 3 by driving the mocked step screens' callbacks:
 * PhoneScreen.onContinue → sendOtp, then OtpScreen (code filled via its
 * own onChangeCode, as the real screen does) onVerify with a tenant-less
 * user (fresh owner) so the profile step becomes current.
 */
async function renderAtProfileStep() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AuthFlow onComplete={jest.fn()} />);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(PhoneScreen).props.onContinue();
  });
  const otpScreen = renderer.root.findByType(OtpScreen);
  await ReactTestRenderer.act(async () => {
    otpScreen.props.onChangeCode('123456');
  });
  await ReactTestRenderer.act(async () => {
    await otpScreen.props.onVerify();
  });
  return renderer;
}

it('the setupCompany payload carries no serviceCategories key', async () => {
  setupCompany.mockResolvedValueOnce({
    token: 'token-2',
    tenant: { id: 't-1' },
  });

  const renderer = await renderAtProfileStep();
  const profileScreen = renderer.root.findByType(ProfileScreen);

  // Fill the profile through the screen's own onChange (the real
  // ProfileScreen calls it on every field edit), then submit.
  await ReactTestRenderer.act(async () => {
    profileScreen.props.onChange({
      ownerName: 'Kumar Selvan',
      businessName: 'Fenzit Services',
      businessTypes: ['Plumbing service'],
      stateCode: 'TN',
    });
  });
  await ReactTestRenderer.act(async () => {
    await profileScreen.props.onFinish();
  });

  expect(setupCompany).toHaveBeenCalledTimes(1);
  const payload = setupCompany.mock.calls[0][0];
  // The old vocabulary is gone from the wire.
  expect(payload).not.toHaveProperty('serviceCategories');
  // The fields the API does expect go out as before.
  expect(payload).toMatchObject({
    name: 'Kumar Selvan',
    companyName: 'Fenzit Services',
    stateCode: 'TN',
  });

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

it('the ≥1-business-type validation still blocks an empty selection', async () => {
  const renderer = await renderAtProfileStep();
  const profileScreen = renderer.root.findByType(ProfileScreen);

  // The screen requires a name too — fill it so the business-type check is
  // the one that fires.
  await ReactTestRenderer.act(async () => {
    profileScreen.props.onChange({ ownerName: 'Kumar Selvan' });
  });
  await ReactTestRenderer.act(async () => {
    await profileScreen.props.onFinish();
  });

  expect(setupCompany).not.toHaveBeenCalled();
  expect(renderer.root.findByType(ProfileScreen).props.serverError).toBe(
    'Select at least one business type.',
  );

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});