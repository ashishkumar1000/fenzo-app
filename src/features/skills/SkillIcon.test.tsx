/**
 * Tests for SkillIcon's name resolution — the piece that keeps the frontend
 * free of hardcoded skill icons. The catalog's `icon` field (a lucide icon
 * name, kebab-case) must resolve dynamically through the lucide namespace,
 * and an unresolvable name must fall back to a neutral glyph rather than
 * crash.
 *
 * `lucide-react-native` is mocked with just two named exports so the tests
 * pin OUR lookup logic (kebab → PascalCase, fallback on a miss) without
 * depending on lucide's internals.
 */
jest.mock('lucide-react-native', () => ({
  AirVent: function AirVent() {
    return null;
  },
  Wrench: function Wrench() {
    return null;
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { SkillIcon } from './SkillIcon';

function glyphNameOf(name: string): string | undefined {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<SkillIcon name={name} size={20} />);
  });
  // SkillIcon renders the resolved glyph directly, so its single child's
  // component type is the matched lucide export.
  const child = renderer.root.children[0] as ReactTestRenderer.ReactTestInstance;
  const Glyph = child.type as { name?: string };
  return Glyph.name;
}

it('resolves a kebab-case catalog icon name to its lucide component', () => {
  expect(glyphNameOf('air-vent')).toBe('AirVent');
});

it('falls back to the wrench glyph when the name cannot resolve', () => {
  // A catalog row with a stale/unknown icon name must degrade, never crash.
  expect(glyphNameOf('no-such-icon')).toBe('Wrench');
});
