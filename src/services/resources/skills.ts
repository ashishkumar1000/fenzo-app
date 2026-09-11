/**
 * services/resources/skills.ts
 * ─────────────────────────────
 * Skills API — the fixed global skills catalog (`GET /skills`), seeded by
 * developer migrations. Skills are read-only for the app: job creation tags
 * them (`skillId`), technician invites tag them (`skillIds`), and the store
 * for both pickers lives in `features/skills/useSkills.ts`.
 *
 * The read path overrides `list()` because `GET /skills` returns a
 * `{ skills: [...] }` envelope in seed order, not a plain array — the generic
 * `ApiService.list()` would hand callers the envelope object instead of the
 * rows. A malformed/missing envelope is surfaced as a thrown error so callers
 * treat it as a fetch failure, never as silently-wrong data.
 *
 * POST/DELETE inheritance stays for now (the endpoints 404 since the tenant
 * skills CRUD was dropped in Story 4.2); their removal is Story 5.4's.
 */
import { ApiService } from '../api/ApiService';

/** A catalog skill — exactly what `GET /skills` returns (id + name; the name is the display label). */
export interface Skill {
  id: string;
  name: string;
}

/** Shape captured when creating a new skill. `name` is trimmed, non-empty, max 100 chars, unique per tenant (case-insensitive) — enforced server-side. */
export interface NewSkillInput {
  name: string;
}

/**
 * The user-facing copy the store's error banner shows when `GET /skills`
 * comes back in a shape this client cannot trust — the backend contract is
 * `{ skills: [{ id, name }] }`, so an envelope missing that nesting (or a row
 * without a usable id/name) means the payload is unusable for the pickers
 * and must be surfaced as a fetch failure, never rendered as data.
 */
const SKILLS_SHAPE_ERROR = "Couldn't load the job types. Please try again.";

/** `skills` must be an array of rows, each carrying a string id and name. */
function isSkillRows(value: unknown): value is Skill[] {
  return (
    Array.isArray(value) &&
    value.every(
      row =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as { id?: unknown }).id === 'string' &&
        typeof (row as { name?: unknown }).name === 'string',
    )
  );
}

class SkillService extends ApiService<Skill, NewSkillInput> {
  /**
   * `GET /skills` → unwraps the `{ skills: Skill[] }` envelope, preserving
   * the backend's seed order (`sort_order` asc) — callers must not re-sort.
   *
   * A malformed or missing envelope (or a row without a string id/name)
   * throws instead of returning it, so the store's catch branch treats it
   * like any other failed fetch.
   */
  override async list(): Promise<Skill[]> {
    const res = await this.client.get<{ skills?: unknown }>(this.path);
    const { skills } = res.data ?? {};
    if (!isSkillRows(skills)) {
      throw new Error(SKILLS_SHAPE_ERROR);
    }
    return skills;
  }
}

/** Singleton client for the `skills` resource — import this, not the class. */
export const skillService = new SkillService('skills');
