/**
 * apiEndpoint — the prod/local switch contract: prod is the default when
 * nothing is stored, the switch and URL persist, the URL normalizes
 * (trim/trailing slash) and rejects junk, and listeners fire on every
 * change. Uses the real module against MMKV — storage is the app's own
 * MMKV instance, which jest's native-module stub backs with a working
 * in-memory store, so no module mocks are needed.
 */
import {
  getApiEndpointMode,
  getApiEndpointSnapshot,
  getEffectiveApiBaseUrl,
  getLocalApiUrl,
  normalizeApiUrl,
  setApiEndpointMode,
  setLocalApiUrl,
  subscribeApiEndpoint,
} from './apiEndpoint';
import { API_BASE_URL, DEFAULT_LOCAL_API_URL } from '../config';
import { storage } from './storage';

const MODE_KEY = 'fenzit.apiEndpointMode';
const LOCAL_URL_KEY = 'fenzit.localApiUrl';

describe('apiEndpoint', () => {
  // The module reads MMKV at call time (not import time), so removing its
  // two keys resets it — no jest.resetModules ceremony needed.
  beforeEach(() => {
    storage.remove(MODE_KEY);
    storage.remove(LOCAL_URL_KEY);
  });

  describe('defaults', () => {
    it('is prod with the config default local URL when nothing is stored', () => {
      expect(getApiEndpointMode()).toBe('prod');
      expect(getLocalApiUrl()).toBe(DEFAULT_LOCAL_API_URL);
      expect(getEffectiveApiBaseUrl()).toBe(API_BASE_URL);
    });

    it('defaults the snapshot shape, too', () => {
      expect(getApiEndpointSnapshot()).toEqual({
        mode: 'prod',
        localUrl: DEFAULT_LOCAL_API_URL,
      });
    });

    it('keeps the snapshot identity stable while unchanged (useSyncExternalStore)', () => {
      // A fresh object per call would make useSyncExternalStore loop forever.
      expect(getApiEndpointSnapshot()).toBe(getApiEndpointSnapshot());
    });
  });

  describe('mode switch', () => {
    it('switches to local and back, persisting across reads', () => {
      setApiEndpointMode('local');
      expect(getEffectiveApiBaseUrl()).toBe(DEFAULT_LOCAL_API_URL);

      setApiEndpointMode('prod');
      expect(getEffectiveApiBaseUrl()).toBe(API_BASE_URL);
    });

    it('setting the same mode is a no-op', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeApiEndpoint(listener);
      setApiEndpointMode('prod'); // already prod
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('local URL', () => {
    it('stores an override and uses it while in local mode', () => {
      setLocalApiUrl('http://10.0.2.2:3000/api/v1/');
      setApiEndpointMode('local');
      expect(getEffectiveApiBaseUrl()).toBe('http://10.0.2.2:3000/api/v1');
    });

    it('keeps the override effective across a prod→local→prod round trip', () => {
      setLocalApiUrl('http://10.0.2.2:3000/api/v1');
      setApiEndpointMode('local');
      setApiEndpointMode('prod');
      setApiEndpointMode('local');
      expect(getLocalApiUrl()).toBe('http://10.0.2.2:3000/api/v1');
    });

    it('an empty override falls back to the config default', () => {
      storage.set('fenzit.localApiUrl', '');
      expect(getLocalApiUrl()).toBe(DEFAULT_LOCAL_API_URL);
    });
  });

  describe('normalizeApiUrl', () => {
    it('trims whitespace and trailing slashes', () => {
      expect(normalizeApiUrl('  http://192.168.1.5:3000/api/v1/  ')).toBe(
        'http://192.168.1.5:3000/api/v1',
      );
      expect(normalizeApiUrl('http://host/api/v1///')).toBe('http://host/api/v1');
    });

    it('rejects anything that is not an http(s) URL', () => {
      expect(() => normalizeApiUrl('192.168.1.5:3000')).toThrow();
      expect(() => normalizeApiUrl('')).toThrow();
      expect(() => normalizeApiUrl('ftp://host')).toThrow();
    });

    it('accepts an uppercase scheme — the URL would work', () => {
      expect(normalizeApiUrl('HTTP://192.168.1.5:3000/api/v1')).toBe(
        'HTTP://192.168.1.5:3000/api/v1',
      );
    });

    it('rejects embedded credentials — a backend URL never carries them', () => {
      expect(() => normalizeApiUrl('http://user:pass@host/api/v1')).toThrow();
      expect(() => normalizeApiUrl('http://user@host/api/v1')).toThrow();
      // A user@ inside the PATH is not credentials — still fine.
      expect(normalizeApiUrl('http://host/api/user@x')).toBe('http://host/api/user@x');
    });
  });

  describe('subscription', () => {
    it('notifies listeners on mode and URL changes, and stops after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeApiEndpoint(listener);

      setApiEndpointMode('local');
      setLocalApiUrl('http://10.0.2.2:3000/api/v1');
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      setApiEndpointMode('prod');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('the snapshot identity changes across a mutation', () => {
      const before = getApiEndpointSnapshot();
      setApiEndpointMode('local');
      expect(getApiEndpointSnapshot()).not.toBe(before);
    });

    it('re-saving the local URL already in force is a no-op (same contract as the mode setter)', () => {
      setLocalApiUrl('http://10.0.2.2:3000/api/v1');
      const listener = jest.fn();
      const unsubscribe = subscribeApiEndpoint(listener);
      // Trailing-slash variant normalizes to the same value — still a no-op.
      setLocalApiUrl('http://10.0.2.2:3000/api/v1/');
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('a throwing listener does not starve the other subscribers', () => {
      const bomb = jest.fn(() => {
        throw new Error('render crash mid-sync');
      });
      const after = jest.fn();
      const unsubscribe1 = subscribeApiEndpoint(bomb);
      const unsubscribe2 = subscribeApiEndpoint(after);
      setApiEndpointMode('local');
      expect(bomb).toHaveBeenCalled();
      expect(after).toHaveBeenCalled();
      unsubscribe1();
      unsubscribe2();
    });
  });
});