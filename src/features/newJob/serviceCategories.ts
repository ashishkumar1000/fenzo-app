/**
 * Service-category codes → tile presentation.
 *
 * `/users/me` returns `tenant.serviceCategories` as machine codes
 * (`['ac_technician', 'plumber', 'pest_control']`), so the New job tiles need
 * this table to render anything a human would recognise.
 *
 * ⚠️ Only `ac_technician` and `pest_control` are confirmed against the backend
 * docs. The other seven mirror `SERVICE_CATEGORY_BY_BUSINESS_TYPE` in
 * `features/auth/constants.ts` — the app writes those codes itself at company
 * setup, so they're what real accounts hold today, but the backend has never
 * published its full enum. Hence `resolveServiceCategory` degrades instead of
 * assuming this table is exhaustive.
 *
 * Labels here are the short tile forms ("AC Service"), deliberately not auth's
 * verbose signup labels ("AC / HVAC service") which don't fit a 3-column tile.
 *
 * Kept in this feature while New job is the only consumer. Move to
 * `src/constants` the moment a second screen needs to label a category.
 */
import {
  AirVent,
  Bug,
  Hammer,
  Package,
  Settings,
  SprayCan,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { ServiceType } from './types';

const DISPLAY: Record<string, { label: string; icon: LucideIcon }> = {
  // Confirmed against the backend docs.
  ac_technician: { label: 'AC Service', icon: AirVent },
  pest_control: { label: 'Pest Control', icon: Bug },
  // Written by this app at company setup — see the warning above.
  plumber: { label: 'Plumbing', icon: Wrench },
  electrician: { label: 'Electrical', icon: Zap },
  appliance_repair: { label: 'Appliance Repair', icon: WashingMachine },
  cleaning: { label: 'Cleaning', icon: SprayCan },
  carpentry: { label: 'Carpentry', icon: Hammer },
  general_maintenance: { label: 'Maintenance', icon: Settings },
  other: { label: 'Other', icon: Package },
};

/** `solar_install` → `Solar Install`. Last resort for an unmapped code. */
function humanize(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Turns one API code into a tile. Unknown codes get a humanised label and the
 * generic icon rather than being hidden: a category the owner actually signed
 * up for must stay selectable, or they simply cannot book that kind of job.
 */
export function resolveServiceCategory(code: string): ServiceType {
  const known = DISPLAY[code];
  return {
    id: code,
    label: known?.label ?? humanize(code),
    icon: known?.icon ?? Package,
  };
}

/**
 * Maps the tenant's codes to tiles, preserving API order and dropping
 * duplicates. Company setup already dedupes on write, but this list arrives
 * from the server and shouldn't be trusted to stay that way.
 */
export function resolveServiceCategories(codes: string[]): ServiceType[] {
  return [...new Set(codes)].map(resolveServiceCategory);
}

/**
 * Folds a skill name or category code to a comparable form:
 * `"AC Technician"` → `ac_technician`, `"Pest-Control"` → `pest_control`.
 *
 * Needed because the two vocabularies are only *usually* the same. Service
 * categories are machine codes, but a technician's `skills` are free-text names
 * the tenant typed at `POST /skills` — the docs' own examples are "electrical"
 * and "AC Technician". Comparing raw strings would match `plumber` and miss
 * `AC Technician`, so both sides get normalised first.
 */
function normalizeSkill(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Whether a technician's skill names cover a service-category code.
 *
 * Best-effort by design: the match is advisory, so callers should let the owner
 * assign someone regardless rather than treat `false` as a hard block. A
 * tenant can always name a skill something this can't reconcile
 * ("AC & fridge work" vs `ac_technician`), and an unassignable roster is a
 * worse outcome than an imperfect suggestion.
 */
export function technicianHasSkill(skills: string[], categoryCode: string): boolean {
  const target = normalizeSkill(categoryCode);
  return skills.some(skill => normalizeSkill(skill) === target);
}
