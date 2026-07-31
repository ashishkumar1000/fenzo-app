/**
 * services/index.ts — barrel export for the shared services layer.
 *
 * Folder map:
 *   storage.ts    → raw MMKV instance (key/value persistence)
 *   authToken.ts  → session token get/set/clear, built on storage.ts
 *   api/          → the REST infrastructure (apiClient, ApiError, ApiService)
 *                   — see api/ApiService.ts for the generic CRUD class
 *   resources/    → one file per backend resource (technicianService, etc.)
 *                   — all API calls for the whole app live here, in one
 *                   place, regardless of which feature uses them. See
 *                   resources/technicians.ts for the template to copy.
 *
 * Import from this barrel (`@services` / `'../../services'`), not from the
 * individual files — it keeps call sites stable if files move around inside
 * this folder later.
 */
export { apiClient, setOnUnauthorized } from './api/apiClient';
export type { ApiError } from './api/apiClient';
export { ApiService, createCancelSignal } from './api/ApiService';
export type { ListParams } from './api/ApiService';
export type { Paginated } from './api/pagination';
export { getAuthToken, setAuthToken, clearAuthToken } from './authToken';
export { storage } from './storage';
export * from './resources';

