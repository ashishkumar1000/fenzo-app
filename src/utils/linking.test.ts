/**
 * Tests for the deep-link helpers (`openTel`, `openMaps`).
 *
 * `react-native` is mocked wholesale — these helpers only need `Linking`
 * and `Platform`, and mocking gives full control over the OS branch (the
 * coordinate and text-query URL forms differ per platform).
 *
 * The helpers must swallow their own failures (file-level contract): every
 * rejection path asserts no throw and a quiet `console.warn`.
 */
let mockOS: 'ios' | 'android' = 'ios';
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn(), canOpenURL: jest.fn().mockResolvedValue(true) },
  Platform: {
    select: (spec: Record<string, unknown>) => spec[mockOS as string] ?? spec.default,
  },
}));

import { Linking } from 'react-native';
import { openMaps, openTel } from './linking';

const openURL = Linking.openURL as jest.Mock;
const canOpenURL = Linking.canOpenURL as jest.Mock;

/** Run the body under a given OS regardless of the previous one. */
async function withOS<T>(os: 'ios' | 'android', run: () => T | Promise<T>): Promise<T> {
  const original = mockOS;
  mockOS = os;
  try {
    return await run();
  } finally {
    mockOS = original;
  }
}

/** The exact today's text-query URL for a query (platform-agnostic form). */
function textUrl(query: string, prefix: 'maps:0,0?q=' | 'geo:0,0?q='): string {
  return `${prefix}${encodeURIComponent(query)}`;
}

beforeEach(() => {
  openURL.mockReset().mockResolvedValue(undefined);
  canOpenURL.mockReset().mockResolvedValue(true);
});

describe('openMaps — coordinate mode', () => {
  const coords = { latitude: 12.9716, longitude: 77.5946 };

  it('iOS builds maps://?q={lat},{lng} from the given coordinates', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', 'Bengaluru', coords);
      expect(openURL).toHaveBeenCalledWith('maps://?q=12.9716,77.5946');
    });
  });

  it('Android builds geo:{lat},{lng}?q={lat},{lng} from the given coordinates', async () => {
    await withOS('android', async () => {
      await openMaps('12 MG Road', 'Bengaluru', coords);
      expect(openURL).toHaveBeenCalledWith('geo:12.9716,77.5946?q=12.9716,77.5946');
    });
  });

  it('coordinates win even when address/city are also present', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', 'Bengaluru', coords);
      expect(openURL).toHaveBeenCalledWith('maps://?q=12.9716,77.5946');
    });
  });

  it('coordinates are used verbatim — no rounding, no encoding', async () => {
    await withOS('ios', async () => {
      await openMaps('x', null, { latitude: 12.971598700000001, longitude: -77.5946 });
      expect(openURL).toHaveBeenCalledWith('maps://?q=12.971598700000001,-77.5946');
    });
  });

  it('usable coordinates open a URL even with blank text halves (future callers)', async () => {
    await withOS('ios', async () => {
      await openMaps('  ', null, coords);
      expect(openURL).toHaveBeenCalledWith('maps://?q=12.9716,77.5946');
    });
  });

  it('a rejected openURL in coordinate mode is logged, never thrown', async () => {
    await withOS('ios', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      openURL.mockRejectedValueOnce(new Error('no maps app'));
      await expect(openMaps('12 MG Road', 'Bengaluru', coords)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('openMaps — text-query fallback', () => {
  it('null coordinates fall back to the exact text query (iOS)', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', 'Bengaluru', { latitude: null, longitude: null });
      expect(openURL).toHaveBeenCalledWith(textUrl('12 MG Road, Bengaluru', 'maps:0,0?q='));
    });
  });

  it('absent coordinates fall back to the exact text query (Android)', async () => {
    await withOS('android', async () => {
      await openMaps('12 MG Road', 'Bengaluru');
      expect(openURL).toHaveBeenCalledWith(textUrl('12 MG Road, Bengaluru', 'geo:0,0?q='));
    });
  });

  it('half-present coordinates (longitude null) are not usable → text fallback', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', 'Bengaluru', { latitude: 12.9716, longitude: null });
      expect(openURL).toHaveBeenCalledWith(textUrl('12 MG Road, Bengaluru', 'maps:0,0?q='));
    });
  });

  it('half-present coordinates (latitude null) are not usable → text fallback', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', 'Bengaluru', { latitude: null, longitude: 77.5946 });
      expect(openURL).toHaveBeenCalledWith(textUrl('12 MG Road, Bengaluru', 'maps:0,0?q='));
    });
  });

  it('city-less text query omits the city join', async () => {
    await withOS('ios', async () => {
      await openMaps('12 MG Road', null);
      expect(openURL).toHaveBeenCalledWith('maps:0,0?q=12%20MG%20Road');
    });
  });

  it('blank address and city without usable coordinates → nothing opened', async () => {
    await withOS('ios', async () => {
      await openMaps('  ', null);
      await openMaps('  ', null, { latitude: null, longitude: null });
      expect(openURL).not.toHaveBeenCalled();
    });
  });
});

describe('openMaps — failure swallowing', () => {
  it('a rejected openURL is logged, never thrown (text branch)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    openURL.mockRejectedValueOnce(new Error('no maps app'));
    await expect(openMaps('12 MG Road')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('openTel', () => {
  it('dials countryCode + phoneNumber after checking the scheme', async () => {
    await openTel('+91', '9123456780');
    expect(canOpenURL).toHaveBeenCalledWith('tel:+919123456780');
    expect(openURL).toHaveBeenCalledWith('tel:+919123456780');
  });

  it('blank halves → nothing dialled', async () => {
    await openTel('  ', '9123456780');
    await openTel('+91', '');
    expect(openURL).not.toHaveBeenCalled();
    expect(canOpenURL).not.toHaveBeenCalled();
  });

  it('a rejected openURL is logged, never thrown', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    openURL.mockRejectedValueOnce(new Error('no dialer'));
    await expect(openTel('+91', '9123456780')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('canOpenURL false → nothing dialled, quietly', async () => {
    canOpenURL.mockResolvedValueOnce(false);
    await openTel('+91', '9123456780');
    expect(openURL).not.toHaveBeenCalled();
  });
});