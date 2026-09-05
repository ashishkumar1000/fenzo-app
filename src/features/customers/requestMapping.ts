/**
 * `NewCustomerInput` → `CreateCustomerRequest` mapping, used by
 * `AddCustomerScreen` — kept in one place so the "Places is additive, never
 * mandatory" field-omission rule can't drift if another caller ever needs it.
 */
import { DIAL_CODE } from './constants';
import type { NewCustomerInput } from './types';
import type { CreateCustomerRequest } from '../../services';

/**
 * Builds the `POST /customers` payload from the sheet's form values.
 *
 * The endpoint has no `area` field, so Area is merged into the address line
 * as "<address>, <area>" — either part alone is sent on its own. Optional
 * fields are omitted rather than sent as empty strings, so the backend
 * stores null instead of "".
 *
 * `placeId` is only ever set when the sheet has a resolved
 * `AddressPickerSheet` snapshot — the other 4 resolved fields (and
 * `pincode`, gated separately since a resolved place can legitimately have
 * none) are omitted entirely otherwise.
 */
export function toCreateCustomerRequest(
  input: NewCustomerInput,
): CreateCustomerRequest {
  const address = [input.address, input.area].filter(Boolean).join(', ');

  return {
    name: input.name,
    countryCode: DIAL_CODE,
    phoneNumber: input.phone,
    ...(address ? { address } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.placeId
      ? {
          formattedAddress: input.formattedAddress,
          latitude: input.latitude,
          longitude: input.longitude,
          placeId: input.placeId,
          ...(input.pincode ? { pincode: input.pincode } : {}),
        }
      : {}),
  };
}
