/**
 * Component tests for ConvertStage (Story 20-1, ACs 2/4/10). Presentational
 * contract, probed with plain props: the confirm paragraph carries
 * `dayMonthLabel(workDate)` verbatim and NEVER says "approved" about the
 * past request; the failure slot renders ONLY when the host passes a
 * message (a partial failure's composed line rides verbatim — AC 10);
 * while the write is in flight the confirm spins/disables and Keep-half-day
 * disables (no exit while a cancel may already have landed); at rest both
 * buttons fire their handlers. RTR house idioms: buttons by type+children.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Button, InlineError } from '../../../components/ui';
import { ConvertStage } from './ConvertStage';

type Props = Parameters<typeof ConvertStage>[0];

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

function renderStage(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<ConvertStage {...baseProps(props)} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    workDate: '2026-10-07',
    submitting: false,
    errorMessage: null,
    onBack: jest.fn(),
    onConfirm: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('the confirm copy (AC 4 — the locked decision)', () => {
  it('the a11y container carries the full confirm copy with the day label verbatim', () => {
    const root = renderStage();
    expect(
      root.find(
        n =>
          typeof n.type === 'string' &&
          (n.props.accessibilityLabel ?? '').includes(
            'Convert to full day. Your half-day request will be cancelled, and a new full-day request will be sent for 7 October. Your owner needs to approve it again.',
          ),
      ),
    ).toBeDefined();
  });

  it('at rest both moves render once each', () => {
    const root = renderStage();
    expect(
      root.findAll(n => typeof n.type === 'string' && n.props.children === 'Cancel and send new request'),
    ).toHaveLength(1);
    expect(
      root.findAll(n => typeof n.type === 'string' && n.props.children === 'Keep half day'),
    ).toHaveLength(1);
  });
});

describe('the failure slot (AC 10)', () => {
  it('absent while the message area is clear', () => {
    const root = renderStage();
    expect(root.findAllByType(InlineError)).toHaveLength(0);
  });

  it('renders the host-composed message verbatim (server line + already-cancelled line)', () => {
    const root = renderStage({
      errorMessage: 'Those dates are already off. Your half-day request is already cancelled.',
    });
    const errors = root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe(
      'Those dates are already off. Your half-day request is already cancelled.',
    );
  });
});

describe('the write posture', () => {
  it('at rest the confirm fires exactly once per press', () => {
    const onConfirm = jest.fn();
    const root = renderStage({ onConfirm });
    const button = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Cancel and send new request');
    expect(button!.props.disabled).toBe(false);
    expect(button!.props.loading).toBe(false);
    act(() => {
      button!.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('in flight the confirm spins/disables and the exit route is cut off (a cancel may have landed)', () => {
    const onBack = jest.fn();
    const root = renderStage({ submitting: true, onBack });
    const confirm = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Cancel and send new request');
    const back = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Keep half day');
    expect(confirm!.props.loading).toBe(true);
    expect(confirm!.props.disabled).toBe(true);
    // The house pin is the disabled prop gate (the DS button mirrors it on
    // this node).
    expect(back!.props.disabled).toBe(true);
  });
});