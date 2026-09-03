/**
 * Pins the query-string output of the shared axios instance — the seam between
 * `apiClient`'s `paramsSerializer` config and the URL that actually goes on
 * the wire. The jobs status filter depends on repeat-style arrays
 * (`?status=a&status=b`); axios's default emits bracket style (`?status[]=a`),
 * which the backend's query parser silently ignores, so a regression here
 * would break every repeatable query param invisibly (proven live 2026-09-03).
 */
import { API_BASE_URL } from '../src/config';
import { apiClient } from '../src/services/api/apiClient';

it('serializes array params repeat-style, not bracket-style', () => {
  expect(
    apiClient.getUri({
      url: '/jobs',
      params: { status: ['scheduled', 'in_progress'] },
    }),
  ).toBe(`${API_BASE_URL}/jobs?status=scheduled&status=in_progress`);
});

it('keeps plain params and drops null, undefined and empty-array params', () => {
  expect(
    apiClient.getUri({
      url: '/jobs',
      params: { limit: 10, date: undefined, cursor: null, status: [] },
    }),
  ).toBe(`${API_BASE_URL}/jobs?limit=10`);
});
