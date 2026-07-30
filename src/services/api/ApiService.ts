/**
 * ApiService.ts
 * ─────────────
 * Generic REST resource client. This is the piece that makes hitting a new
 * backend endpoint a one-liner instead of hand-rolled axios calls scattered
 * across features.
 *
 * ── Basic usage (plain CRUD, no extra methods needed) ──────────────────────
 *
 *   import { ApiService } from '@services';
 *   import type { Technician } from './types';
 *
 *   export const technicianService = new ApiService<Technician>('technicians');
 *
 *   const list = await technicianService.list(); // GET /technicians
 *   const one  = await technicianService.getById('t_1'); // GET /technicians/t_1
 *   const made = await technicianService.create({ name }); // POST /technicians
 *   await technicianService.update('t_1', { name }); // PATCH /technicians/t_1
 *   await technicianService.remove('t_1'); // DELETE /technicians/t_1
 *
 * ── When a resource needs more than CRUD ────────────────────────────────────
 * Extend the class and add the extra method. It still gets the shared axios
 * instance (`this.client`) and the resource's base path (`this.path`) for
 * free — see `src/services/resources/technicians.ts` for a real example (`invite`).
 *
 *   class TechnicianService extends ApiService<Technician, NewTechnicianInput> {
 *     invite(input: NewTechnicianInput) {
 *       return this.client.post<Technician>(`${this.path}/invite`, input)
 *         .then(res => res.data);
 *     }
 *   }
 *
 * ── Error handling ──────────────────────────────────────────────────────────
 * Every method rejects with `ApiError` (see apiError.ts) on failure — never
 * a raw axios error. Callers can rely on `.status`, `.code`, `.message`.
 *
 *   try {
 *     await technicianService.create(input);
 *   } catch (err) {
 *     const apiError = err as ApiError;
 *     Alert.alert(apiError.message);
 *   }
 *
 * ── Cancelling a request (e.g. on unmount) ──────────────────────────────────
 *
 *   const { signal, cancel } = createCancelSignal();
 *   technicianService.list(undefined, { signal });
 *   // later, e.g. in a useEffect cleanup:
 *   cancel();
 */
import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './apiClient';

/** Query-string params for `.list()` — e.g. `{ status: 'active', page: 2 }`, or `{ ids: ['a', 'b'] }` for repeated keys. */
export interface ListParams {
  [key: string]: string | number | boolean | Array<string | number> | undefined;
}

/**
 * Builds the `{path}/{id}` URL segment for a single-record request.
 * URL-encodes `id` (so ids containing `/`, spaces, etc. don't corrupt the
 * path) and rejects an empty id up front instead of silently sending a
 * request to the collection root (`{path}/`).
 */
function resourcePath(path: string, id: string | number): string {
  const raw = String(id);
  if (raw.trim() === '') {
    throw new Error(`ApiService: empty id passed for resource "${path}"`);
  }
  return `${path}/${encodeURIComponent(raw)}`;
}

/**
 * Generic CRUD client for one REST resource.
 *
 * @typeParam T - The resource shape returned by the API (e.g. `Technician`).
 * @typeParam TCreate - Payload shape for `.create()`. Defaults to `Partial<T>`; pass a dedicated input type (e.g. `NewTechnicianInput`) when the create payload differs from the full resource (typical — servers usually generate `id`, timestamps, etc.).
 * @typeParam TUpdate - Payload shape for `.update()`. Defaults to `Partial<T>`, which fits most partial-update (PATCH) endpoints.
 */
export class ApiService<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  /** Shared axios instance — available to subclasses that need custom endpoints beyond plain CRUD. */
  protected readonly client = apiClient;

  /**
   * @param path - Resource path relative to `API_BASE_URL`, e.g. `'technicians'` → requests go to `{API_BASE_URL}/technicians`. No leading/trailing slash needed.
   */
  constructor(protected readonly path: string) {}

  /**
   * GET `{path}` — fetch the full (or filtered) list.
   * @param params - Optional query-string filters, e.g. `{ status: 'active' }`.
   * @param config - Optional axios overrides, e.g. `{ signal }` for cancellation.
   */
  async list(params?: ListParams, config?: AxiosRequestConfig): Promise<T[]> {
    const res = await this.client.get<T[]>(this.path, {
      ...config,
      // `params` (the dedicated arg) wins over `config.params` if both are
      // somehow set — but falls back to `config.params` so passing filters
      // via `config` directly still works instead of being silently dropped.
      params: params ?? config?.params,
    });
    return res.data;
  }

  /**
   * GET `{path}/{id}` — fetch a single record.
   * @param id - Resource identifier.
   */
  async getById(id: string | number, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.get<T>(resourcePath(this.path, id), config);
    return res.data;
  }

  /**
   * POST `{path}` — create a new record.
   * @param data - Create payload (shape = `TCreate`).
   */
  async create(data: TCreate, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.post<T>(this.path, data, config);
    return res.data;
  }

  /**
   * PATCH `{path}/{id}` — partially update an existing record.
   * @param id - Resource identifier.
   * @param data - Fields to update (shape = `TUpdate`).
   */
  async update(id: string | number, data: TUpdate, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.patch<T>(resourcePath(this.path, id), data, config);
    return res.data;
  }

  /**
   * DELETE `{path}/{id}` — remove a record.
   * @param id - Resource identifier.
   */
  async remove(id: string | number, config?: AxiosRequestConfig): Promise<void> {
    await this.client.delete(resourcePath(this.path, id), config);
  }
}


/**
 * Creates an `AbortController` + `signal` pair for cancelling an in-flight
 * request. Pass `{ signal }` as the `config` argument to any `ApiService`
 * method; call `cancel()` to abort it.
 *
 * Typical use: cancel a fetch if a component unmounts before it resolves,
 * so a stale response never lands on an unmounted screen.
 *
 * @example
 *   useEffect(() => {
 *     const { signal, cancel } = createCancelSignal();
 *     jobService.list(undefined, { signal }).then(setJobs);
 *     return cancel;
 *   }, []);
 */
export function createCancelSignal() {
  const controller = new AbortController();
  return { signal: controller.signal, cancel: () => controller.abort() };
}
