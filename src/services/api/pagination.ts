/**
 * pagination.ts
 * ─────────────
 * The backend's cursor-pagination envelope, shared by every list endpoint
 * that uses it (`GET /customers`, the `customers`/`jobs` blocks inside
 * `GET /users/me`, and presumably `GET /jobs` when it lands).
 *
 * Lives in `api/` rather than in one resource file so resources don't have to
 * import types from each other.
 */

export interface Paginated<T> {
  data: T[];
  /** `null` when `hasMore` is false — otherwise pass it back as the next request's cursor. */
  nextCursor: string | null;
  hasMore: boolean;
}
