/**
 * Customers feature — public surface.
 */
export { default as CustomersScreen } from './CustomersScreen';
export { AddCustomerSheet } from './components/AddCustomerSheet';
export { useCustomers, loadCustomers, upsertCustomer } from './useCustomers';
export { customerLocation, customerPhone } from './format';
export { DIAL_CODE } from './constants';
export type { Customer, NewCustomerInput } from './types';
