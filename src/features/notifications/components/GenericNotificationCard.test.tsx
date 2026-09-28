/**
 * GenericNotificationCard — the event-type registry's fallback card
 * (Story 14-3). What the CARD decides: readable text from the registry's
 * data, the unread marker, and above all its INERTNESS — no pressable, no
 * button role, no footer button — so a tap can never touch job UI.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';

import { relativeTime } from '../../../utils';
import { buildGenericCards } from '../notificationEventRegistry';
import type { ApiNotification } from '../../../services';
import type {
  AttendanceNotificationCardData,
  GenericNotificationCardData,
} from '../notificationEventRegistry';
import { GenericNotificationCard } from './GenericNotificationCard';

const CREATED_AT = new Date(Date.now() - 30_000).toISOString(); // 30s ago → "Just now"

function makeCard(
  overrides: Partial<GenericNotificationCardData> = {},
): GenericNotificationCardData {
  // Overrides apply to the BUILT card (isUnread/message are derived from the
  // row by the registry — row-level overrides of them would be ignored).
  return {
    ...buildGenericCards(
      [
        {
          id: 'g1',
          jobId: null,
          eventType: 'leave_approved',
          entityType: null,
          entityId: null,
          payload: { title: 'Leave approved', message: 'See you on the 30th' },
          readAt: null,
          createdAt: CREATED_AT,
        } as ApiNotification,
      ],
      'owner',
    )[0],
    ...overrides,
  };
}

/** The card's own a11y announcement is computed here, not matcher-guessed. */
function labelOf(renderer: ReactTestRenderer.ReactTestRenderer): string {
  const view = renderer.root
    .findAllByType(View)
    .find(v => typeof v.props.accessibilityLabel === 'string');
  if (!view) throw new Error('accessibilityLabel not rendered');
  return view.props.accessibilityLabel as string;
}

async function renderCard(
  card: GenericNotificationCardData | AttendanceNotificationCardData,
  onPress?: () => void,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(GenericNotificationCard, onPress ? { card, onPress } : { card }),
    );
  });
  return renderer;
}

describe('GenericNotificationCard', () => {
  it('renders the title, message and relative time as text', async () => {
    const renderer = await renderCard(makeCard());
    const text = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(text).toContain('Leave approved');
    expect(text).toContain('See you on the 30th');
    expect(text).toContain(relativeTime(CREATED_AT));
  });

  it('is INERT: no button role, no pressable, no footer button', async () => {
    const renderer = await renderCard(makeCard());

    // The other card kinds announce themselves as buttons; this one must not.
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
    // No interactive primitive anywhere in the tree.
    expect(renderer.root.findAllByProps({ onPress: expect.anything() })).toHaveLength(0);
  });

  it('an unread card announces the unread prefix', async () => {
    const renderer = await renderCard(makeCard());

    const label = labelOf(renderer);
    expect(label).toContain('Unread. ');
    expect(label).toContain('Leave approved');
  });

  it('a read card drops the unread prefix', async () => {
    const renderer = await renderCard(makeCard({ isUnread: false }));

    const label = labelOf(renderer);
    expect(label).not.toContain('Unread');
  });

  it('a card without a message renders only title + time', async () => {
    const renderer = await renderCard(makeCard({ message: null }));
    const text = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(text).toContain('Leave approved');
    expect(text).not.toContain('See you on the 30th');
  });
});

describe('GenericNotificationCard — Story 15-10 attendance cards (optional onPress)', () => {
  const ATTENDANCE_CARD: AttendanceNotificationCardData = {
    kind: 'attendance',
    key: 'a1',
    title: 'Holiday added',
    message: 'Diwali — Sat, 8 Nov 2026',
    latestCreatedAt: CREATED_AT,
    isUnread: true,
    unreadIds: ['a1'],
  };

  it('renders attendance-card data: title, composed message, relative time', async () => {
    const renderer = await renderCard(ATTENDANCE_CARD);

    const text = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(text).toContain('Holiday added');
    expect(text).toContain('Diwali — Sat, 8 Nov 2026');
    expect(text).toContain(relativeTime(CREATED_AT));
  });

  it('WITHOUT onPress the card stays inert — no button role, no press handler', async () => {
    const renderer = await renderCard(ATTENDANCE_CARD);

    // The generic fallback's contract is unchanged: an attendance card
    // without a handler renders as plain readable content.
    expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
    expect(
      renderer.root.findAll((n) => typeof n.props?.onPress === 'function'),
    ).toHaveLength(0);
  });

  it('WITH onPress the card becomes a button and the handler fires exactly once per press', async () => {
    const onPress = jest.fn();
    const renderer = await renderCard(ATTENDANCE_CARD, onPress);

    // The role mirrors through nested host layers in RTR — assert presence,
    // not a single node (the RosterScreen.test.tsx convention).
    expect(
      renderer.root.findAllByProps({ accessibilityRole: 'button' }).length,
    ).toBeGreaterThan(0);
    // RN's Pressable is memo-wrapped, so type identity fails in RTR —
    // select the press surface by its button role + handler (the BMAD
    // finding-6 fix dropped the accessibilityState disabled: false prop —
    // inert cards render a plain View, tappable ones a plain button).
    const pressable = renderer.root.find(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.onPress === 'function',
    );
    expect(pressable).toBeDefined();

    await act(async () => {
      pressable.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
