/**
 * Contract test: every icon name in the skills catalog migration must
 * resolve to a real lucide-react-native export.
 *
 * `SkillIcon` falls back to a Wrench glyph on a miss — silent and invisible
 * in every other suite (they mock lucide or stub `SkillIcon` entirely), so
 * without this test a typo'd icon name in a seed migration, or a lucide
 * upgrade that renames an export, would ship wrong glyphs across the New Job
 * grid and the full-screen browser with no failing test.
 *
 * The names are read straight from the fenzit-be migration (not duplicated
 * here), so the two repos cannot drift apart. This file deliberately does
 * NOT mock lucide — the real package's export set is the thing under test.
 */
import { readFileSync } from 'fs';
import path from 'path';
import * as LucideIcons from 'lucide-react-native';

// fenzo-app/src/features/skills → the sibling backend repo in the workspace.
const MIGRATION = path.resolve(
  __dirname,
  '../../../../../backend/fenzit-be/supabase/migrations/20260920000002_add_skill_icons.sql',
);

/** Matches the migration's VALUES rows: ('<uuid>', '<icon-name>'). */
const ICON_ROW = /\('[0-9a-f-]{36}',\s*'([a-z0-9-]+)'\)/g;

/** 'shower-head' → 'ShowerHead' — mirrors SkillIcon's lookup. */
function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

it('resolves every catalog icon name to a real lucide export', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const names = [...sql.matchAll(ICON_ROW)].map(match => match[1]);

  // If this fails, the regex no longer matches the migration's format —
  // fix the parse, don't lower the bar.
  expect(names).toHaveLength(28);

  const lookup = LucideIcons as unknown as Record<string, unknown>;
  const unresolvable = names.filter(name => !lookup[toPascalCase(name)]);
  expect(unresolvable).toEqual([]);
});