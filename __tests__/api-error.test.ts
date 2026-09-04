/**
 * `toApiError` — the one place raw axios failures become the app's `ApiError`.
 * Pinned here: the ValidationPipe's array-form `message` must flatten to a
 * plain string (so no UI consumer ever sees an array), string messages pass
 * through, and the status-based defaults fill in when the envelope is empty.
 */
import type { AxiosError } from 'axios';
import { toApiError } from '../src/services/api/apiError';

function axiosError(response?: {
  status: number;
  data: unknown;
}): AxiosError {
  return {
    isAxiosError: true,
    code: undefined,
    response,
  } as unknown as AxiosError;
}

it('flattens a ValidationPipe message array into one sentence', () => {
  const apiError = toApiError(
    axiosError({
      status: 422,
      data: { error_code: 'VALIDATION_ERROR', message: ['a', 'b'] },
    }),
  );

  expect(apiError.message).toBe('a. b');
  expect(apiError.code).toBe('VALIDATION_ERROR');
});

it('passes a string message through untouched', () => {
  const apiError = toApiError(
    axiosError({
      status: 409,
      data: { error_code: 'JOB_NOT_MODIFIABLE', message: 'Job has started' },
    }),
  );

  expect(apiError.message).toBe('Job has started');
});

it('falls back to the status default when the envelope has no message', () => {
  const apiError = toApiError(
    axiosError({ status: 404, data: { error_code: 'NOT_FOUND' } }),
  );

  expect(apiError.message).toBe("That couldn't be found.");
  // A single-element array must also read as that one string, not "a. ".
  const oneItem = toApiError(
    axiosError({ status: 422, data: { error_code: 'VALIDATION_ERROR', message: ['only'] } }),
  );
  expect(oneItem.message).toBe('only');
});