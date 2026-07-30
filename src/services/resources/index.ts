/**
 * services/resources/index.ts
 * ────────────────────────────
 * Every resource's API service, in one place. When you add a new resource:
 *
 *   1. Create `services/resources/<resource>.ts` (copy `technicians.ts` as
 *      a template).
 *   2. Add one line here: `export { fooService } from './foo';`
 *
 * Features never import a resource file directly — they go through the
 * top-level `@services` barrel, which re-exports everything from here.
 */
export { technicianService } from './technicians';
