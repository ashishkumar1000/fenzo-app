/**
 * Technician seed data.
 *
 * A new account starts with NO technicians — that empty state is the whole
 * point of the first-run flow (Home checklist → Technicians → add first one).
 *
 * `SAMPLE_TECHNICIANS` is kept only to preview the populated list during
 * development; it is not used at runtime. Real technicians will come from the
 * backend via `useTechnicians().add()` (see the INTEGRATION POINT there).
 */
import type { Technician } from './types';

export const SAMPLE_TECHNICIANS: Technician[] = [
  {
    id: 'tech_sample_1',
    name: 'Suresh Kumar',
    phone: '+91 98765 43210',
    status: 'active',
    invitedAt: '2025-01-10T09:00:00.000Z',
  },
  {
    id: 'tech_sample_2',
    name: 'Vijay Singh',
    phone: '+91 91234 56780',
    status: 'offline',
    invitedAt: '2025-01-12T09:00:00.000Z',
  },
];
