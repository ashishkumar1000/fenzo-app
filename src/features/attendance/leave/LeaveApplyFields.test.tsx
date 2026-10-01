/**
 * LeaveApplyFields' COUNT SLOT truth table (Story 20-1 loading sweep on
 * 17-6's shared form body) — the field is presentational, so the table is
 * prop-driven:
 *
 *  - idle + no From → the "Pick dates" hint is the only content — no GET
 *    has started, nothing to wait on.
 *  - the FIRST preview's wait (loading, no old count, From picked) → the
 *    small chip-shaped shimmer stands in the slot instead of blank space.
 *  - a RE-validation wait (loading WITH an old count) → the old chip dims,
 *    never disappears and never shimmers over a live number.
 *  - ok → the count chip; rejected/transport → the notice, verbatim.
 *  - the owner route's `countSlot` REPLACES the whole area — even while the
 *    technician shimmer conditions hold, no Skeleton mounts there.
 *  - the reason presets prefill the Reason VERBATIM (a typing shortcut,
 *    nothing else) and the 500 cap lives on the Input.
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Input, InlineNotice, Skeleton } from '../../../components/ui';
import { Text } from 'react-native';
import { LeaveApplyFields } from './LeaveApplyFields';
import type { LeavePreviewState } from './useLeaveApply';

function preview(overrides: Partial<LeavePreviewState> = {}): LeavePreviewState {
  return { status: 'idle', workingDays: null, message: null, ...overrides };
}

type Props = Parameters<typeof LeaveApplyFields>[0];

let lastRenderer: ReactTestRenderer | null = null;

function baseProps(previewState: LeavePreviewState): Props {
  return {
    typeOptions: [
      { value: 'full_day' as const, label: 'Full day' },
      { value: 'first_half' as const, label: 'First half' },
    ],
    part: 'full_day' as const,
    onChangePart: () => {},
    resetNote: false,
    from: null,
    to: null,
    onOpenFromPicker: () => {},
    onOpenToPicker: () => {},
    preview: previewState,
    showEmptyHint: true,
    reason: '',
    onChangeReason: () => {},
    onClearTo: undefined,
    countSlot: undefined,
  };
}

function renderFields(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <LeaveApplyFields {...baseProps(preview())} {...props} />,
    );
  });
  lastRenderer = renderer;
  return renderer.root;
}

afterEach(() => {
  if (lastRenderer) {
    const r = lastRenderer;
    lastRenderer = null;
    act(() => r.unmount());
  }
});

describe('the count slot truth table', () => {
  it('idle + no From: the hint is the only content — no GET to wait on', () => {
    const root = renderFields();
    expect(root.findAllByType(Skeleton)).toHaveLength(0);
    expect(
      root.findAll((n) => n.props.children === 'Pick dates to see the working-days count.').length,
    ).toBeGreaterThan(0);
  });

  it('the FIRST preview wait (loading, no old count, From picked): the chip-shaped shimmer', () => {
    const root = renderFields({ preview: preview({ status: 'loading' }), from: '2026-10-07' });
    expect(root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(
      root.findAll((n) => n.props.children === 'Pick dates to see the working-days count.').length,
    ).toBe(0); // the hint never coexists with a wait
  });

  it('a first-RE wait with NO From picked: still the hint (no GET started)', () => {
    const root = renderFields({ preview: preview({ status: 'loading' }) });
    expect(root.findAllByType(Skeleton)).toHaveLength(0);
    expect(
      root.findAll((n) => n.props.children === 'Pick dates to see the working-days count.').length,
    ).toBeGreaterThan(0);
  });

  it('a re-validation wait WITH an old count: the live chip dims — never blank, never skeleton', () => {
    const root = renderFields({
      preview: preview({ status: 'loading', workingDays: 3 }),
      from: '2026-10-07',
    });
    expect(root.findAllByType(Skeleton)).toHaveLength(0);
    expect(
      root.findAll((n) => n.props.children === '3 working days').length,
    ).toBeGreaterThan(0);
  });

  it('ok: the count chip renders the copy', () => {
    const root = renderFields({ preview: preview({ status: 'ok', workingDays: 1 }) });
    expect(
      root.findAll((n) => n.props.children === '1 working day').length,
    ).toBeGreaterThan(0);
    expect(root.findAllByType(Skeleton)).toHaveLength(0);
  });

  it('rejected: the notice is the slot, message verbatim', () => {
    const root = renderFields({ preview: preview({ status: 'rejected', message: 'Overlapping request already exists' }) });
    const notes = root.findAllByType(InlineNotice).filter((n) => n.props.message === 'Overlapping request already exists');
    expect(notes).toHaveLength(1);
    expect(notes[0].props.tone).toBe('info');
  });

  it('transport: the FE-owned offline line, verbatim, tone neutral', () => {
    const root = renderFields({ preview: preview({ status: 'transport', message: "You're offline. Counts need a working connection." }) });
    const notes = root.findAllByType(InlineNotice).filter((n) => n.props.message === "You're offline. Counts need a working connection.");
    expect(notes).toHaveLength(1);
    expect(notes[0].props.tone).toBe('neutral');
  });
});

describe('the owner countSlot (no live preview on the owner route)', () => {
  it('replaces the WHOLE area — a shimmer condition holding still mounts no Skeleton there', () => {
    const root = renderFields({
      preview: preview({ status: 'loading' }), // the technician shimmer would fire
      from: '2026-10-07',
      countSlot: <Text testID="owner-slot">Approved on submission</Text>,
    });
    expect(root.findAllByType(Skeleton)).toHaveLength(0);
    expect(root.findAllByProps({ testID: 'owner-slot' }).length).toBeGreaterThan(0);
    expect(
      root.findAll((n) => n.props.children === 'Pick dates to see the working-days count.').length,
    ).toBe(0);
  });
});

describe('the reason block', () => {
  it('a preset tap prefills the reason VERBATIM (a typing shortcut, nothing else)', () => {
    const onChangeReason = jest.fn();
    const root = renderFields({ onChangeReason });
    const preset = root.findAllByProps({ accessibilityLabel: 'Use Sick leave as the reason' })[0];
    act(() => {
      preset.props.onPress();
    });
    expect(onChangeReason).toHaveBeenCalledWith('Sick leave');
  });

  it('the reason Input carries the 500 cap and echoes the running count', () => {
    const root = renderFields({ reason: 'Family function' });
    const input = root.findByType(Input);
    expect(input.props.maxLength).toBe(500);
    expect(input.props.value).toBe('Family function');
    expect(countersJoined(root)).toBe('15 / 500');
  });

  it('a reason at the near-limit keeps the same counter shape (the warn style is code, not copy)', () => {
    const root = renderFields({ reason: 'a'.repeat(450) });
    expect(countersJoined(root)).toBe('450 / 500');
    expect(
      root
        .findAll((n: ReactTestInstance) => n.type === Text && /450 \/ 500/.test(flatText(n)))
        .length,
    ).toBe(1);
  });
});

function flatText(node: ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function countersJoined(root: ReactTestInstance): string {
  return root
    .findAll((n: ReactTestInstance) => n.type === Text)
    .map(flatText)
    .find((t) => /\/ 500$/.test(t)) ?? '';
}