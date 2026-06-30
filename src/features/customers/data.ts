/**
 * Mock customer data for the Customers list, until a real customer service
 * exists.
 */
import type { Customer } from './types';

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'cust_1', name: 'Priya Sharma', location: 'Andheri West, Mumbai', lifetimeValue: 6400, jobCount: 4 },
  { id: 'cust_2', name: 'Ramesh Kumar', location: 'Bandra West, Mumbai', lifetimeValue: 18900, jobCount: 7 },
  { id: 'cust_3', name: 'Fatima Sheikh', location: 'Bandra West, Mumbai', lifetimeValue: 9200, jobCount: 3 },
  { id: 'cust_4', name: 'Karan Mehta', location: 'Chembur, Mumbai', lifetimeValue: 42500, jobCount: 5 },
  { id: 'cust_5', name: 'Anil Desai', location: 'Powai, Thane', lifetimeValue: 3400, jobCount: 2 },
  { id: 'cust_6', name: 'Sneha Iyer', location: 'Vashi, Navi Mumbai', lifetimeValue: 1400, jobCount: 1 },
];
