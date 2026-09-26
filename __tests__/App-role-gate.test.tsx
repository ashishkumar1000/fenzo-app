/**
 * App.tsx's role gate — the RealtimeBridge mounts in BOTH role branches
 * (Story 14-3; owner since 3.3). The bridge components are tested in
 * isolation elsewhere, so only App's decision to mount them is pinned here:
 * removing `<RealtimeBridge />` from either branch fails the matching test
 * (the technician's socket can only ever open from the technician branch).
 * The navigation trees are stubbed — this file is about the role gate.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

let mockSession: { role: 'owner' | 'technician'; tenantId: string } | null = null;
jest.mock('../src/features/auth', () => ({
  useAuth: () => ({ status: 'done', session: mockSession, complete: jest.fn() }),
  expireSession: jest.fn(),
}));
jest.mock('../src/features/onboarding', () => ({
  OnboardingScreen: () => null,
  useOnboarding: () => ({ status: 'done', complete: jest.fn() }),
}));
jest.mock('../src/features/splash', () => ({ AnimatedBootSplash: () => null }));
jest.mock('../src/services', () => ({
  runAllResets: jest.fn(),
  setOnUnauthorized: jest.fn(),
}));
jest.mock('../src/navigation/RootNavigator', () => () => null);
jest.mock('../src/navigation/TechnicianRootNavigator', () => () => null);
// SafeAreaProvider defers its children to the native insets callback, which
// never fires in jest — render the children directly.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  return {
    ...actual,
    SafeAreaProvider: (props: { children: React.ReactNode }) => props.children,
  };
});
jest.mock('../src/features/notifications/RealtimeBridge', () => {
  const { Text } = require('react-native');
  return { RealtimeBridge: () => <Text testID="realtime-bridge">bridge</Text> };
});

import App from '../src/App';

beforeEach(() => {
  mockSession = null;
});

afterEach(() => {
  jest.clearAllMocks();
});

async function mountApp() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  return renderer;
}

it('the technician branch mounts the RealtimeBridge (the technician socket can only open here)', async () => {
  mockSession = { role: 'technician', tenantId: 'tenant-1' };

  const renderer = await mountApp();

  // At least one bridge marker in the technician branch's tree.
  expect(renderer.root.findAllByProps({ testID: 'realtime-bridge' }).length).toBeGreaterThan(0);
});

it('the owner branch mounts the RealtimeBridge too — one bridge for both roles', async () => {
  mockSession = { role: 'owner', tenantId: 'tenant-1' };

  const renderer = await mountApp();

  expect(renderer.root.findAllByProps({ testID: 'realtime-bridge' }).length).toBeGreaterThan(0);
});