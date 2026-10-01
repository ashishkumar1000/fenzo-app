/**
 * Tests for the shared ConfirmDialog (Story 20-1): the DS modal's contracts
 * every consumer rides on —
 *  - anatomy: the strong title, the rich body, the OPTIONAL rows card
 *    (only when rows are passed) and the confirm + secondary buttons;
 *  - confirmVariant 'danger' styles the destructive confirm (Cancel leave);
 *  - every non-confirm exit routes to the SAME onCancel: the secondary, the
 *    header X and a tap on the scrim;
 *  - `submitting` blocks dismissal entirely: the buttons disable, the
 *    spinner shows, the X is disabled and BOTH the scrim tap and the
 *    Android back gesture are no-ops (the write must settle).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Button, ConfirmDialog, IconButton } from './index';
import { colors } from '../../theme';

let onConfirm: jest.Mock;
let onCancel: jest.Mock;

beforeEach(() => {
  onConfirm = jest.fn();
  onCancel = jest.fn();
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <ConfirmDialog
        visible
        title="Cancel leave request?"
        message="Your owner will be notified."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />,
    );
  });
  // Modal children keep an animation running in the tree — unmount so the
  // worker never outlives the test.
  mounted.push(renderer);
  return renderer;
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

function button(root: ReactTestRenderer.ReactTestRenderer['root'], label: string) {
  return root.findAllByType(Button).find(b => b.props.children === label);
}

function dialogModal(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  // Exactly one Modal carries the dialog; the find throws if two match.
  return renderer.root.find(n => n.type === Modal && n.props.visible === true);
}

function scrimOf(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  // The scrim is the OUTERMOST Pressable: the tree's first Pressable that
  // labels itself with the cancel label (Buttons nest deeper inside).
  return renderer.root.find(
    n => String(n.type).includes('Pressable') && n.props.accessibilityLabel === 'Keep request',
  );
}

describe('anatomy', () => {
  it('renders the title, the message and both buttons', () => {
    const root = renderDialog().root;
    expect(button(root, 'Cancel request')).toBeDefined();
    expect(button(root, 'Keep request')).toBeDefined();
    const texts = root
      .findAllByType(Text)
      .map(t => (typeof t.props.children === 'string' ? t.props.children : ''));
    expect(texts).toContain('Cancel leave request?');
    expect(texts).toContain('Your owner will be notified.');
  });

  it('renders the optional rows card ONLY when rows are passed', () => {
    const withRows = renderDialog({
      rows: [{ label: 'Status', value: 'Pending → Cancelled' }],
    }).root;
    const rowsCards = withRows
      .findAllByType(View)
      .filter(v => StyleSheet.flatten(v.props.style)?.backgroundColor === colors.surfacePage);
    expect(rowsCards).toHaveLength(1);

    const without = renderDialog().root;
    const stray = without
      .findAllByType(View)
      .filter(v => StyleSheet.flatten(v.props.style)?.backgroundColor === colors.surfacePage);
    expect(stray).toHaveLength(0);
  });
});

describe('the confirm routing', () => {
  it('the confirm press fires onConfirm and nothing else', () => {
    const root = renderDialog().root;
    act(() => {
      button(root, 'Cancel request')!.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("confirmVariant 'danger' hands the danger variant to the confirm button (the destructive vocabulary)", () => {
    const renderer = renderDialog({ confirmVariant: 'danger' });
    const confirm = button(renderer.root, 'Cancel request')!;
    expect(confirm.props.variant).toBe('danger');
  });

  it('the default confirmVariant stays primary (a forward action, not a destructive one)', () => {
    const renderer = renderDialog();
    const confirm = button(renderer.root, 'Cancel request')!;
    expect(confirm.props.variant).toBe('primary');
  });
});

describe('the cancel routing (every non-confirm exit resolves once)', () => {
  it('the secondary fires onCancel', () => {
    const root = renderDialog().root;
    act(() => {
      button(root, 'Keep request')!.props.onPress();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a tap on the SCRIM fires onCancel', () => {
    const renderer = renderDialog();
    act(() => {
      scrimOf(renderer).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('the Android back gesture routes to onCancel', () => {
    const renderer = renderDialog();
    act(() => {
      dialogModal(renderer).props.onRequestClose();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('the submitting guard (the write must settle)', () => {
  it('a scrim tap is a NO-OP while submitting', () => {
    const renderer = renderDialog({ submitting: true });
    const scrim = scrimOf(renderer);
    expect(scrim.props.onPress).toBeUndefined();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('the buttons are disabled while submitting (the confirm spinner shows)', () => {
    const root = renderDialog({ submitting: true }).root;
    const confirm = button(root, 'Cancel request')!;
    const secondary = button(root, 'Keep request')!;
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.loading).toBe(true);
    expect(secondary.props.disabled).toBe(true);
  });

  it('the header X is disabled while submitting (it cannot fire a hidden cancel)', () => {
    const renderer = renderDialog({ submitting: true });
    const x = renderer.root.findAllByType(IconButton)[0];
    expect(x.props.disabled).toBe(true);
  });

  it('the Android back gesture is a no-op while submitting', () => {
    const renderer = renderDialog({ submitting: true });
    const modal = dialogModal(renderer);
    expect(modal.props.onRequestClose).toBeUndefined();
  });
});