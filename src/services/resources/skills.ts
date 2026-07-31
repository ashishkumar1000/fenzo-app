/**
 * services/resources/skills.ts
 * ─────────────────────────────
 * Skills API — the tenant's list of assignable skills (e.g. "electrical",
 * "AC Technician"), used to populate the skill picker on the technician
 * invite screen and to tag technicians with what they can do.
 *
 * Plain CRUD maps 1:1 onto the documented endpoints, so no custom methods
 * are needed beyond what `ApiService` already gives for free:
 *   - `list()`          → GET    /skills
 *   - `create(input)`   → POST   /skills
 *   - `remove(id)`      → DELETE /skills/:id
 *
 * There's no PATCH /skills/:id in the API reference, so `.update()` is
 * inherited but intentionally unused — don't call it until the backend
 * documents an update endpoint.
 */
import { ApiService } from '../api/ApiService';

export interface Skill {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
}

/** Shape captured when creating a new skill. `name` is trimmed, non-empty, max 100 chars, unique per tenant (case-insensitive) — enforced server-side. */
export interface NewSkillInput {
  name: string;
}

class SkillService extends ApiService<Skill, NewSkillInput> {}

/** Singleton client for the `skills` resource — import this, not the class. */
export const skillService = new SkillService('skills');
