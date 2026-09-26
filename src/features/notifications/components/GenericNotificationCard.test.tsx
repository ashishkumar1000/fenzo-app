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
import type { GenericNotificationCardData } from '../notificationEventRegistry';
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

async function renderCard(card: GenericNotificationCardData) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(GenericNotificationCard, { card }));
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
