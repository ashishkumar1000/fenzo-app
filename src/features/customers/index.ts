/**
 * Customers feature — public surface.
 */
export { default as CustomersScreen } from './CustomersScreen';
export { default as AddCustomerScreen } from './AddCustomerScreen';
export { useCustomers, loadCustomers, upsertCustomer } from './useCustomers';
export { customerLocation, customerPhone, filterCustomers } from './format';
export { DIAL_CODE } from './constants';
export { toCreateCustomerRequest } from './requestMapping';
export type { Customer, NewCustomerInput } from './types';
