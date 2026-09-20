/**
 * SkillIcon — renders a skill's icon from the backend catalog.
 *
 * `skills.icon` is a lucide icon NAME (kebab-case, e.g. 'droplets' —
 * https://lucide.dev/icons). This component deliberately keeps NO icon map:
 * the name from `GET /skills` is converted to lucide's PascalCase export and
 * looked up in the package itself, so a skill added by a seed migration
 * renders its icon with zero app-side changes (as long as the app's lucide
 * version ships that icon).
 *
 * An unknown name (catalog ahead of the installed lucide version) falls back
 * to a neutral Wrench glyph — never a crash or a blank row.
 *
 * ⚠️ Known trade-off: the namespace import defeats tree-shaking, so Metro
 * bundles the whole lucide set. The alternative — an app-side icon map — is
 * exactly what this design forbids (icons must come from the backend), so
 * the bundle cost is accepted. Revisit only if bundle size becomes a
 * measured problem.
 */
import * as LucideIcons from 'lucide-react-native';
import { Wrench } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

/** 'shower-head' → 'ShowerHead', 'cctv' → 'Cctv' — lucide's export naming. */
function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

type Props = {
  /** The lucide icon name from the skills catalog row. */
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
};

export function SkillIcon({ name, ...glyphProps }: Props) {
  const lookup = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  const Glyph = lookup[toPascalCase(name)] ?? Wrench;
  return <Glyph {...glyphProps} />;
}
