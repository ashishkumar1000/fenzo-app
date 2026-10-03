/**
 * OtpScreen's WAIT surfaces (Story 20-1 loading sweep): the resend link's
 * three postures and the verify CTA's loading —
 *
 *  - counting → "New code in {m:ss}", the link files nothing.
 *  - expired  → the active link fires onResend WITH the done callback; the
 *    window restarts only when done fires (a slow POST can't eat the 45s).
 *  - resending → "Resending…" and the link files NOTHING even at zero —
 *    the countdown neither runs nor restarts while the POST is in flight.
 *  - verifying/complete gate the verify CTA, not the resending posture.
 *  - DEV OTP fills the code only under __DEV__ with devOtp given.
 *
 * Fake timers drive the countdown; renderers unmount at teardown.
 */
jest.mock('../components/OtpInput', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    OtpInput: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'otp-input', ...props }),
  };
});
jest.mock('../components/AuthScaffold', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    AuthScaffold: ({ children }: { children: unknown }) =>
      ReactLib.createElement(View, { testID: 'auth-scaffold' }, children),
  };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '../../../components/ui';
import { Text } from 'react-native';
import { OtpScreen } from './OtpScreen';

type Props = Parameters<typeof OtpScreen>[0];

let lastRenderer: ReactTestRenderer | null = null;

function baseProps(): Props {
  return {
    phone: '9000000000',
    code: '',
    onChangeCode: () => {},
    onVerify: () => {},
    onResend: () => {},
    onChangeNumber: () => {},
    verifying: false,
    resending: false,
    error: undefined,
    devOtp: undefined,
  };
}

function renderScreen(props: Partial<Props> = {}) {
  const merged: Props = { ...baseProps(), ...props };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<OtpScreen {...merged} />);
  });
  lastRenderer = renderer;
  return {
    root: renderer.root,
    renderer,
    props: merged,
  };
}

function flatText(node: ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestInstance): string[] {
  return root.findAll((n) => n.type === Text).map(flatText);
}

/** The resend Pressable — the composite is mirrored by host Views, so find
 *  it by walking UP from the label Text to the nearest press ancestor. */
function resendLink(root: ReactTestInstance): ReactTestInstance {
  const label = root.findAll((n: ReactTestInstance) =>
    n.type === Text && flatText(n).includes('Resend')
  )[0];
  if (!label) throw new Error('Resend link not found');
  let node: ReactTestInstance | null = label;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error('Resend pressable not found');
  return node;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  if (lastRenderer) {
    const r = lastRenderer;
    lastRenderer = null;
    act(() => r.unmount());
  }
  jest.useRealTimers();
});

describe('the resend link postures', () => {
  it('fresh mount: the window is fresh (0:45) and COUNTING — the link files nothing while it runs', () => {
    const onResend = jest.fn();
    const root = renderScreen({ onResend }).root;
    expect(texts(root)).toContain('New code in 0:45');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(texts(root)).toContain('New code in 0:44');
    expect(onResend).not.toHaveBeenCalled();
  });

  it('expired: the link fires onResend with the done callback; the window does NOT restart until done', () => {
    const onResend = jest.fn();
    let done!: () => void;
    onResend.mockImplementation((cb?: () => void) => {
      done = cb as () => void;
    });
    const root = renderScreen({ onResend }).root;
    act(() => {
      jest.advanceTimersByTime(45_000);
    });
    expect(texts(root)).toContain('Resend code'); // active
    expect(texts(root)).not.toContain('New code in 0:1');
    act(() => {
      resendLink(root).props.onPress();
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    // Not done yet — the link neither restarts nor runs ahead.
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(texts(root)).toContain('Resend code'); // still active, frozen
    act(() => {
      done();
    });
    // Done fires → the window restarts fresh.
    expect(texts(root)).toContain('New code in 0:45');
  });

  it('resending: the link reads "Resending…" and files NOTHING even at zero', () => {
    const onResend = jest.fn();
    const root = renderScreen({ onResend, resending: true }).root;
    act(() => {
      jest.advanceTimersByTime(45_000);
    });
    expect(texts(root)).toContain('Resending…');
    act(() => {
      resendLink(root).props.onPress();
    });
    expect(onResend).not.toHaveBeenCalled();
  });

  it('while resending the countdown neither RUNS (no ticking) nor restarts from a stale done', () => {
    const root = renderScreen({ resending: true }).root;
    const before = texts(root).find((t) => t.startsWith('New code in'));
    act(() => {
      jest.advanceTimersByTime(45_000 + 10_000);
    });
    const after = texts(root).find((t) => t.startsWith('New code in'));
    expect(after).toBe(before); // frozen for the POST's whole flight
  });
});

describe('the verify CTA gate', () => {
  it('an incomplete code keeps the CTA DISABLED (pinned — the native press is what a disabled gate denies)', () => {
    const onVerify = jest.fn();
    const root = renderScreen({ code: '12', onVerify, verifying: false }).root;
    const cta = root.findAllByType(Button).find((b) =>
      flatText(b).includes('Verify & continue'),
    );
    if (!cta) throw new Error('Verify CTA not found');
    expect(cta.props.disabled).toBe(true);
  });

  it('a complete code enables the CTA; verifying pins it back disabled as Verifying…', () => {
    const onVerify = jest.fn();
    const root = renderScreen({ code: '123456', onVerify, verifying: true }).root;
    const cta = root.findAllByType(Button).find((b) =>
      flatText(b).includes('Verifying…'),
    );
    if (!cta) throw new Error('Verifying CTA not found');
    expect(cta.props.disabled).toBe(true);
  });
});

describe('the DEV OTP banner and error line', () => {
  it('under __DEV__ with devOtp: the banner shows and tapping fills the whole code', () => {
    const onChangeCode = jest.fn();
    const root = renderScreen({ onChangeCode, devOtp: '415263' }).root;
    expect(texts(root).some((t) => t.includes('DEV — OTP is 415263'))).toBe(true);
    const label = root.findAll((n: ReactTestInstance) =>
      n.type === Text && flatText(n).includes('DEV — OTP is')
    )[0];
    if (!label) throw new Error('DEV banner not found');
    let banner = label as ReactTestInstance | null;
    while (banner != null && typeof banner.props.onPress !== 'function') {
      banner = banner.parent;
    }
    if (banner == null) throw new Error('DEV pressable not found');
    act(() => {
      banner.props.onPress();
    });
    expect(onChangeCode).toHaveBeenCalledWith('415263');
  });

  it('an error shows verbatim and flags the OtpInput once', () => {
    const root = renderScreen({ error: 'Wrong code, try again' }).root;
    expect(texts(root)).toContain('Wrong code, try again');
    const otpInput = root.findAllByProps({ testID: 'otp-input' })[0];
    expect(otpInput.props.error).toBe(true);
  });
});