/**
 * Tests for the DS `Sheet` presentation contract: the controlled `visible`
 * prop drives the native `present()`/`dismiss()` calls through the ref, and
 * a native dismissal (drag-down, Android back) flows back through `onClose` —
 * while a programmatic close (parent flipped `visible`) must not call
 * `onClose` a second time. Uses the library's own mock (wired globally in
 * jest.setup.js), whose instances record present/dismiss calls.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Sheet, type SheetProps } from './Sheet';

const baseProps = {
  title: 'Test sheet',
  children: <Text>body</Text>,
} satisfies Omit<SheetProps, 'visible' | 'onClose'>;

function renderSheet(props: Parameters<typeof Sheet>[0]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Sheet {...props} />);
  });
  return renderer;
}

/** The mock TrueSheet class instance records present/dismiss jest calls. */
function nativeCalls(root: ReactTestRenderer.ReactTestInstance) {
  const instance = root.findByType(TrueSheet).instance as {
    present: jest.Mock;
    dismiss: jest.Mock;
  };
  return { present: instance.present, dismiss: instance.dismiss };
}

it('presents only once `visible` flips to true', () => {
  const renderer = renderSheet({ ...baseProps, visible: false, onClose: () => {} });
  expect(nativeCalls(renderer.root).present).not.toHaveBeenCalled();

  act(() => {
    renderer.update(<Sheet {...baseProps} visible onClose={() => {}} />);
  });
  expect(nativeCalls(renderer.root).present).toHaveBeenCalledTimes(1);
});

it('dismisses when `visible` flips back to false', () => {
  const renderer = renderSheet({ ...baseProps, visible: true, onClose: () => {} });
  expect(nativeCalls(renderer.root).dismiss).not.toHaveBeenCalled();

  act(() => {
    renderer.update(<Sheet {...baseProps} visible={false} onClose={() => {}} />);
  });
  expect(nativeCalls(renderer.root).dismiss).toHaveBeenCalledTimes(1);
});

it('routes a native dismissal (drag-down, back) through onClose', () => {
  const onClose = jest.fn();
  const renderer = renderSheet({ ...baseProps, visible: true, onClose });

  act(() => {
    renderer.root.findByType(TrueSheet).props.onDidDismiss();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('does not re-run onClose when a programmatic close settles natively', () => {
  const onClose = jest.fn();
  const renderer = renderSheet({ ...baseProps, visible: true, onClose });

  act(() => {
    renderer.update(<Sheet {...baseProps} visible={false} onClose={onClose} />);
  });
  // The native side still fires `onDidDismiss` after the programmatic
  // `dismiss()` — the guard must swallow it, or the parent's close handler
  // (e.g. a form reset) would run twice.
  act(() => {
    renderer.root.findByType(TrueSheet).props.onDidDismiss();
  });

  expect(onClose).not.toHaveBeenCalled();
});

it('renders the title and content while closed (stays mounted)', () => {
  const root = renderSheet({
    ...baseProps,
    visible: false,
    onClose: () => {},
    subtitle: 'Sub',
  }).root;

  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('Test sheet');
  expect(texts).toContain('Sub');
  expect(texts).toContain('body');
});