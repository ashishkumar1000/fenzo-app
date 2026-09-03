/**
 * Jobs feature types. The display shape is gone — cards render `ApiJob`
 * directly through the formatter layer in `format.ts`.
 */
export type { ApiJob } from '../../services';

/**
 * Filter chip values, using the API's status enum directly so the store can
 * put them straight on the wire. `all` sends no status param.
 */
export type JobFilter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
