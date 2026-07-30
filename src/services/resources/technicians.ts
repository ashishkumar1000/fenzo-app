/**
 * services/resources/technicians.ts
 * ──────────────────────────────────
 * Technician API — reference example for wiring any resource to the
 * backend. Copy this pattern for a new resource:
 *
 *   1. `extends ApiService<T, TCreate>` for the base CRUD methods.
 *   2. Add only what plain CRUD doesn't cover (here: `invite`, a POST to a
 *      non-standard sub-path rather than the resource root).
 *   3. Export a single instance — everything else imports that instance,
 *      never the class, so there's exactly one client per resource
 *      app-wide.
 *   4. Re-export it from `services/resources/index.ts` so it's reachable
 *      from the `@services` barrel alongside every other resource.
 *
 * This file only defines *how* to call the backend. It intentionally does
 * NOT touch `useTechnicians` (the MMKV-backed local store in
 * `features/technicians/`) — wiring the hook to this service is a
 * separate, deliberate change since it affects loading/error state in
 * the UI.
 */
import { ApiService } from '../api/ApiService';
import type { NewTechnicianInput, Technician } from '../../features/technicians/types';

class TechnicianService extends ApiService<Technician, NewTechnicianInput> {
  /**
   * POST `{path}/invite` — sends the SMS invite and returns the created
   * technician record. Not plain CRUD (it's a side-effecting action, not a
   * resource creation at the root path), which is why it's a custom method
   * rather than `.create()`.
   */
  async invite(input: NewTechnicianInput): Promise<Technician> {
    const res = await this.client.post<Technician>(`${this.path}/invite`, input);
    return res.data;
  }

}

/** Singleton client for the `technicians` resource — import this, not the class. */
export const technicianService = new TechnicianService('technicians');
