/**
 * Sample data for the New job screen.
 *
 * ⚠️ Placeholder only — this is the single file to delete once the real
 * sources are wired in:
 *   SERVICE_TYPES  → tenant service catalogue
 *   CUSTOMERS      → customers feature / `GET /customers`
 *   TECHNICIANS    → `useTechnicians()`, already live in the technicians feature
 *
 * Nothing else in the feature reads hardcoded values, so swapping these three
 * for hooks is the whole job.
 */
import { AirVent, Bug, Package, Wind, Wrench, Zap } from 'lucide-react-native';
import type { CustomerOption, ServiceType, TechnicianOption } from './types';

export const SERVICE_TYPES: ServiceType[] = [
  { id: 'ac-service', label: 'AC Service', icon: AirVent },
  { id: 'installation', label: 'Installation', icon: Wind },
  { id: 'pest-control', label: 'Pest Control', icon: Bug },
  { id: 'plumbing', label: 'Plumbing', icon: Wrench },
  { id: 'electrical', label: 'Electrical', icon: Zap },
  { id: 'other', label: 'Other', icon: Package },
];

export const CUSTOMERS: CustomerOption[] = [
  { id: 'c1', name: 'Anita Deshmukh' },
  { id: 'c2', name: 'Rohit Sharma' },
  { id: 'c3', name: 'Green Valley Apartments' },
  { id: 'c4', name: 'Kavita Iyer' },
];

export const TECHNICIANS: TechnicianOption[] = [
  { id: 't1', name: 'Suresh Kumar' },
  { id: 't2', name: 'Mahesh Patil' },
  { id: 't3', name: 'Vijay Singh' },
  { id: 't4', name: 'Imran Shaikh' },
];
