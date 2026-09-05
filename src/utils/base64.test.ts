/**
 * base64ToUint8Array — the decoder the signature upload depends on.
 * The pad exports `data:image/png;base64,…`, and neither Buffer nor atob is
 * guaranteed in the RN/Hermes environment — the decode happens here, in JS,
 * producing the Uint8Array that RN's network layer PUTs byte-exact.
 */
import { base64ToUint8Array } from './base64';

const bytesOf = (base64: string): number[] =>
  Array.from(base64ToUint8Array(base64));

describe('base64ToUint8Array', () => {
  it('decodes the canonical RFC 4648 vectors', () => {
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
    expect(bytesOf('Zg==')).toEqual([102]); // 'f'
    expect(bytesOf('Zm8=')).toEqual([102, 111]); // 'fo'
    expect(bytesOf('Zm9v')).toEqual([102, 111, 111]); // 'foo'
  });

  it('decodes text payloads exactly', () => {
    expect(bytesOf('aGVsbG8=')).toEqual([104, 101, 108, 108, 111]); // 'hello'
    expect(bytesOf('aGVsbG8gd29ybGQ=')).toEqual([
      104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100,
    ]); // 'hello world'
  });

  it('preserves non-ASCII bytes bit-for-bit', () => {
    // The PNG header bytes: 89 50 4E 47 0D 0A 1A 0A — all above 0x7F included.
    expect(bytesOf('iVBORw0KGgo=')).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('handles unpadded input and URL-safe alphabets', () => {
    // URL-safe: 62='-', 63='_'. 0xFB 0xEF 0xBE = 111110·111110·111110·111110
    // → four 62s → '----'; four 63s → '____' → all-ones bytes.
    expect(bytesOf('----')).toEqual([251, 239, 190]);
    expect(bytesOf('____')).toEqual([255, 255, 255]);
  });

  it('skips embedded whitespace', () => {
    expect(bytesOf('aGVs\nbG8=')).toEqual([104, 101, 108, 108, 111]);
  });

  it('throws on a character outside both alphabets', () => {
    expect(() => base64ToUint8Array('a*b!')).toThrow('invalid base64');
  });

  it('throws on a truncated tail with leftover bits', () => {
    // 'Zm9v' is fine; chopping one char off leaves a tail whose leftover
    // bits can't form a byte — silent decoding would shorten the payload,
    // so it must throw. ('Zm8', the canonical unpadded form of 'Zm8=', has
    // zero leftover bits and still decodes.)
    expect(() => base64ToUint8Array('Zm9')).toThrow('truncated input');
    expect(bytesOf('Zm8')).toEqual([102, 111]);
  });
});
