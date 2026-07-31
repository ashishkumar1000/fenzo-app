/**
 * services/resources/technicians.ts
 * ──────────────────────────────────
 * Technician API — reference example for wiring any resource to the
 * backend. Copy this pattern for a new resource:
 *
 *   1. `extends ApiService<T, TCreate>` for the base CRUD methods.
 *   2. Add only what plain CRUD doesn't cover (here: `invite`, an
 *      auth-namespaced action endpoint, not a create on this resource's own
 *      root path).
 *   3. Export a single instance — everything else imports that instance,
 *      never the class, so there's exactly one client per resource
 *      app-wide.
 *   4. Re-export it from `services/resources/index.ts` so it's reachable
 *      from the `@services` barrel alongside every other resource.
 *
 * ⚠️ Only `invite()` below is backed by a documented endpoint. The
 * inherited `.list()/.create()/.update()/.remove()` (→ bare `/technicians`)
 * come from extending `ApiService` but aren't in the API reference this was
 * built against — don't call them until a real `/technicians` CRUD surface
 * is confirmed with the backend.
 *
 * This file only defines *how* to call the backend. It intentionally does
 * NOT touch `useTechnicians` (the MMKV-backed local store in
 * `features/technicians/`) — wiring the hook to this service is a
 * separate, deliberate change since it affects loading/error state in
 * the UI.
 */
import { ApiService } from '../api/ApiService';
import type {
  InviteTechnicianRequest,
  InviteTechnicianResponse,
  NewTechnicianInput,
  Technician,
} from '../../features/technicians/types';

class TechnicianService extends ApiService<Technician, NewTechnicianInput> {
  /**
   * POST `/auth/invite` — sends the SMS invite and returns only the new
   * `invite_id`; the backend does NOT echo back name/phone/skills, so the
   * caller (`useTechnicians.add`) builds the local record from what it
   * already has plus this id.
   *
   * ⚠️ This is under `/auth`, not `{this.path}` (`/technicians`) — an
   * auth-namespaced action endpoint per the API reference, not a resource
   * create at this service's own root path. Hence a literal path here
   * instead of `${this.path}/invite`.
   */
  async invite(input: InviteTechnicianRequest): Promise<InviteTechnicianResponse> {
    const res = await this.client.post<{ invite_id: string }>('/auth/invite', input);
    return { inviteId: res.data.invite_id };
  }

}

/** Singleton client for the `technicians` resource — import this, not the class. */
export const technicianService = new TechnicianService('technicians');
