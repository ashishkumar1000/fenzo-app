/**
 * useCreateCustomer — the `POST /customers` submit chain for
 * `AddCustomerScreen`, extracted verbatim (file split, behaviour unchanged):
 * the submitting/submit-error state, the back-guard that blocks hardware or
 * gesture navigation while the POST is in flight, the error-copy mapping,
 * and the post-success sequence (store write → refresh → navigate back).
 *
 * The hook receives the already-built `CreateCustomerRequest` — payload
 * assembly stays with the caller, which owns the form state and the
 * address-pick snapshot. Only the request *outcome* is this hook's job.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { customerService } from '../../services';
import type { ApiError, CreateCustomerRequest } from '../../services';
import { currentResetEpoch } from '../../services/resetRegistry';
import type { RootStackParamList } from '../../navigation/types';
import { loadCustomers, upsertCustomer } from './useCustomers';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AddCustomer'>;

/**
 * Turns a failed `POST /customers` into copy the screen can show directly.
 * Codes follow the endpoint's documented failures.
 */
function createErrorMessage(err: ApiError): string {
  if (err.status === 409 || err.code === 'DUPLICATE_RESOURCE') {
    return 'A customer with this phone number already exists.';
  }
  if (err.status === 422 || err.code === 'VALIDATION_ERROR') {
    return 'Check the name and phone number — one of them looks invalid.';
  }
  if (err.status === 403) {
    return 'Only the business owner can add customers.';
  }
  if (err.status === 400) {
    return 'Finish setting up your company before adding customers.';
  }
  return err.message;
}

type Props = {
  navigation: Navigation;
  /** The post-save destination (`'Customers'` → plain goBack, `'NewJob'` →
   *  the created id travels as a navigation param). */
  returnRouteName: 'Customers' | 'NewJob';
};

export function useCreateCustomer({ navigation, returnRouteName }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // While the POST is in flight, hardware/gesture back is blocked — the old
  // Modal-based AddCustomerSheet vetoed it via `onRequestClose`; on a full
  // page only a navigation guard covers the gesture path (the header back
  // button's `disabled` does not). Without it the screen pops mid-request,
  // the resolve still lands (`upsertCustomer` + possible NewJob redirect)
  // and a retry of the same phone then 409s. The listener re-arms on every
  // `submitting` flip, so navigation is free again once the request settles.
  const bypassBackGuardRef = useRef(false);

  useEffect(() => {
    if (!submitting) return;
    return navigation.addListener('beforeRemove', e => {
      // The screen's OWN post-save navigation (goBack / navigate to NewJob)
      // dispatches while `submitting` is still true — the listener is only
      // disarmed by the next render, after React Navigation has already
      // evaluated the removal. A prevented removal is never retried, so
      // without this bypass a successful save would leave the screen open.
      if (bypassBackGuardRef.current) return;
      e.preventDefault();
    });
  }, [submitting, navigation]);

  const handleSubmit = useCallback(
    async (request: CreateCustomerRequest) => {
      if (submitting) return;
      setSubmitting(true);
      setSubmitError('');
      // Capture the reset epoch before the await: a concurrent request's 401
      // can tear the session down while the POST is in flight. Everything
      // after the response — store write, refresh, navigation — must then be
      // skipped (see services/resetRegistry.ts).
      const epochAtStart = currentResetEpoch();
      try {
        const created = await customerService.create(request);

        // The customer was created server-side even if the session died
        // mid-flight — the next session's first load picks it up. But its
        // post-response steps belong to a session that no longer exists.
        if (currentResetEpoch() !== epochAtStart) return;

        // Pushed into the shared store directly rather than waiting on a
        // refetch: `Customers`'s list (and `NewJob`'s picker) both read this
        // same store, so this is instantly visible to whichever screen goes
        // back to it — no return-params round trip needed for `Customers`.
        upsertCustomer(created);
        // A failed refresh here is a stale-list problem, not a save failure —
        // the customer above is already created and already in the store, so
        // it must never surface as a create error via the catch below.
        await loadCustomers({ force: true }).catch(() => {});

        // This removal is our own — let the still-armed back guard through
        // (see its comment above).
        bypassBackGuardRef.current = true;
        if (returnRouteName === 'NewJob') {
          navigation.navigate('NewJob', { createdCustomerId: created.id }, { merge: true });
        } else {
          navigation.goBack();
        }
      } catch (err) {
        setSubmitError(createErrorMessage(err as ApiError));
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, navigation, returnRouteName],
  );

  /** Any form edit clears a stale error — the user is most likely fixing
   *  exactly what the server complained about, so a 422 shouldn't sit under
   *  the form while they do. */
  const clearSubmitError = useCallback(() => setSubmitError(''), []);

  return { submitting, submitError, clearSubmitError, handleSubmit };
}