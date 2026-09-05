/**
 * Tests for the places service: the exact URL/params `autosuggest`/`resolve`
 * build (`q`/`sessionToken` for autosuggest, `sessionToken` for resolve, the
 * `AbortSignal` passed through only when the caller supplies one), and how
 * each unwraps its response — `autosuggest` reads `res.data.suggestions`
 * (defensively falling back to `[]` when that field is missing/malformed),
 * `resolve` returns `res.data` untouched.
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { placesService } from './places';
import type { ResolvedPlace } from './places';

const get = apiClient.get as jest.Mock;

const RESOLVED: ResolvedPlace = {
  placeId: 'mock-place-andheri-west-1',
  formattedAddress: 'Andheri West, Mumbai, Maharashtra 400058, India',
  city: 'Mumbai',
  pincode: '400058',
  latitude: 19.1364,
  longitude: 72.8296,
};

describe('placesService.autosuggest', () => {
  it('GETs /places/autosuggest with q and sessionToken, and unwraps suggestions', async () => {
    const suggestions = [{ placeId: 'mock-place-andheri-west-1', text: 'Andheri West, Mumbai' }];
    get.mockResolvedValueOnce({ data: { suggestions } });

    const returned = await placesService.autosuggest('andheri w', 'session-token-1');

    expect(returned).toBe(suggestions);
    expect(get).toHaveBeenCalledWith('/places/autosuggest', {
      params: { q: 'andheri w', sessionToken: 'session-token-1' },
    });
  });

  it('passes the AbortSignal through when the caller supplies one', async () => {
    get.mockResolvedValueOnce({ data: { suggestions: [] } });
    const controller = new AbortController();

    await placesService.autosuggest('andheri w', 'session-token-1', controller.signal);

    expect(get).toHaveBeenCalledWith('/places/autosuggest', {
      params: { q: 'andheri w', sessionToken: 'session-token-1' },
      signal: controller.signal,
    });
  });

  it('falls back to [] when the suggestions field is missing/malformed', async () => {
    get.mockResolvedValueOnce({ data: {} });

    const returned = await placesService.autosuggest('andheri w', 'session-token-1');

    expect(returned).toEqual([]);
  });
});

describe('placesService.resolve', () => {
  it('GETs /places/resolve/:placeId with sessionToken, and returns the resolved place untouched', async () => {
    get.mockResolvedValueOnce({ data: RESOLVED });

    const returned = await placesService.resolve('mock-place-andheri-west-1', 'session-token-1');

    expect(returned).toBe(RESOLVED);
    expect(get).toHaveBeenCalledWith('/places/resolve/mock-place-andheri-west-1', {
      params: { sessionToken: 'session-token-1' },
    });
  });

  it('passes the AbortSignal through when the caller supplies one', async () => {
    get.mockResolvedValueOnce({ data: RESOLVED });
    const controller = new AbortController();

    await placesService.resolve('mock-place-andheri-west-1', 'session-token-1', controller.signal);

    expect(get).toHaveBeenCalledWith('/places/resolve/mock-place-andheri-west-1', {
      params: { sessionToken: 'session-token-1' },
      signal: controller.signal,
    });
  });
});
