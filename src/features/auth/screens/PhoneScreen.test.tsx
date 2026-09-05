/**
 * PhoneScreen — the session-expired banner (story 5.3). The screen is purely
 * presentational, so the tests drive it through props only: the banner shows
 * the exact copy when `sessionExpired` is true, nothing renders otherwise,
 * and the dismiss affordance calls back.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PhoneScreen } from './PhoneScreen';

const baseProps = {
  value: '9876543210',
  onChangePhone: jest.fn(),
  onContinue: jest.fn(),
};

async function render(props: Partial<typeof PhoneScreen> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<PhoneScreen {...baseProps} {...(props as object)} />);
  });
  return renderer;
}

it('shows the session-expired banner with the story copy', async () => {
  const renderer = await render({ sessionExpired: true, onDismissSessionExpired: jest.fn() });

  const banner = renderer.root.findByProps({ accessibilityRole: 'alert' });
  expect(
    banner.findByProps({ children: 'Session expired — please log in again.' }),
  ).toBeTruthy();
  // Dismissible: the affordance must exist alongside the message.
  expect(banner.findByProps({ accessibilityLabel: 'Dismiss' })).toBeTruthy();

  await act(async () => {
    renderer.unmount();
  });
});

it('renders no banner by default', async () => {
  const renderer = await render();

  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);

  await act(async () => {
    renderer.unmount();
  });
});

it('the banner dismiss calls back', async () => {
  const onDismissSessionExpired = jest.fn();
  const renderer = await render({ sessionExpired: true, onDismissSessionExpired });

  const banner = renderer.root.findByProps({ accessibilityRole: 'alert' });
  await act(async () => {
    banner.findByProps({ accessibilityLabel: 'Dismiss' }).props.onPress();
  });
  expect(onDismissSessionExpired).toHaveBeenCalledTimes(1);

  await act(async () => {
    renderer.unmount();
  });
});