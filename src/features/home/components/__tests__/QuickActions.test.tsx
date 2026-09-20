/**
 * QuickActions — pins the setup gate (product feedback 2026-09-20): a job
 * must be assigned to someone, so with no technicians (`canCreateJob: false`)
 * the New job tile renders as a disabled pressable and Add technician takes
 * over the row's primary treatment. Tiles are found via their `onPress`
 * handler identity — Card forwards it to the Pressable unchanged. Also pins
 * the plain count lines ("24 total") on the add tiles: shown only above zero,
 * muted caption text with no chip around it.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { colors } from '../../../../theme';
import { QuickActions } from '../QuickActions';

const mountedRenderers: ReactTestRenderer[] = [];

function makeHandlers() {
  return { onNewJob: jest.fn(), onAddCustomer: jest.fn(), onAddTechnician: jest.fn() };
}

type Handlers = ReturnType<typeof makeHandlers>;

type CountOverrides = {
  customerCount?: number;
  technicianCount?: number;
};

function render(
  canCreateJob: boolean,
  handlers: Handlers,
  counts: CountOverrides = {},
) {
  act(() => {
    mountedRenderers.push(
      create(
        <QuickActions {...handlers} canCreateJob={canCreateJob} {...counts} />,
      ),
    );
  });
}

afterEach(() => {
  mountedRenderers.forEach(renderer => renderer.unmount());
  mountedRenderers.length = 0;
});

/** The interactive tile wired to `handler`. Matched by handler identity
 * only — under the RN jest preset `Pressable` type identity is not stable
 * across module accesses, and the Card element itself carries the same
 * `onPress`/`disabled`/`accessibilityState` props QuickActions passed. */
function tileFor(handler: unknown): ReactTestInstance {
  const match = mountedRenderers[0].root.findAll(
    node => node.props.onPress === handler,
  );
  expect(match.length).toBeGreaterThanOrEqual(1);
  return match[0];
}

/** Style array of the label Text with the exact `children` string. */
function labelStyle(children: string): Array<Record<string, unknown> | undefined> {
  const label = mountedRenderers[0].root.findByProps({ children });
  const style = label.props.style;
  return Array.isArray(style) ? style : [style];
}

/** Style array of a tile (the Card receives the array QuickActions builds). */
function styleOf(tile: ReactTestInstance): Array<Record<string, unknown> | undefined> {
  const style = tile.props.style;
  return Array.isArray(style) ? style : [style];
}

it('with technicians available: New job is enabled and stays the primary', () => {
  const handlers = makeHandlers();
  render(true, handlers);

  const newJobTile = tileFor(handlers.onNewJob);
  expect(newJobTile.props.disabled).toBe(false);
  // The tiles are buttons to screen readers (Card forwards the role; RN's
  // Pressable sets none of its own).
  expect(newJobTile.props.accessibilityRole).toBe('button');
  expect(
    labelStyle('New job').some(s => s?.color === colors.onPrimary),
  ).toBe(true);
  // Add technician keeps the secondary look while New job is actionable.
  expect(
    labelStyle('Add technician').some(s => s?.color === colors.onPrimary),
  ).toBe(false);
  // And no disabled dimming on the enabled tile.
  expect(
    styleOf(newJobTile).some(s => s?.opacity === 0.5),
  ).toBe(false);
});

it('without technicians: New job is disabled and Add technician goes primary', () => {
  const handlers = makeHandlers();
  render(false, handlers);

  const newJobTile = tileFor(handlers.onNewJob);
  expect(newJobTile.props.disabled).toBe(true);
  expect(newJobTile.props.accessibilityState).toEqual({ disabled: true });
  // The dimming Card's doc leaves to the caller — Button's 0.5 look.
  expect(styleOf(newJobTile).some(s => s?.opacity === 0.5)).toBe(true);

  expect(
    labelStyle('Add technician').some(s => s?.color === colors.onPrimary),
  ).toBe(true);

  // The other tiles stay tappable.
  expect(tileFor(handlers.onAddCustomer).props.disabled).toBeFalsy();
  expect(tileFor(handlers.onAddTechnician).props.disabled).toBeFalsy();
});

// --- Count lines (product feedback 2026-09-20) --------------------------------

/** The text a node renders — its string children, joined (a JSX-interpolated
 * line like `{count} total` arrives as `[24, ' total']`). */
function renderedText(node: ReactTestInstance): string {
  const children = node.props.children;
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(c => (typeof c === 'string' || typeof c === 'number') ? String(c) : '').join('');
  }
  return '';
}

/** Every rendered count-line text ("24 total", …). Text renders nested under
 * the RN preset, so the same line appears on two nodes — deduped here. */
function countLineTexts(): string[] {
  return [...new Set(
    mountedRenderers[0].root
      .findAll(node => renderedText(node).endsWith(' total'))
      .map(renderedText),
  )];
}

it('shows a plain count line under each add tile when its count is positive', () => {
  const handlers = makeHandlers();
  render(true, handlers, { customerCount: 24, technicianCount: 5 });

  expect(countLineTexts().sort()).toEqual(['24 total', '5 total']);
  // Muted caption text, no chip/badge treatment around it.
  const line = mountedRenderers[0].root
    .findAll(node => renderedText(node) === '24 total')[0];
  const style = Array.isArray(line.props.style)
    ? line.props.style
    : [line.props.style];
  expect(style.some(s => s?.color === colors.textMuted)).toBe(true);
});

it('hides the count line at zero and when the count is not provided', () => {
  const handlers = makeHandlers();
  render(true, handlers, { customerCount: 0 });

  // customerCount 0 hides its line; technicianCount omitted defaults to 0.
  expect(countLineTexts()).toEqual([]);
});
