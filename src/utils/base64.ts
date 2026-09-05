/**
 * base64.ts — base64 decoding without Node Buffer or atob. Neither is
 * guaranteed in the RN/Hermes environment, and the one consumer (the
 * signature upload's data-URI branch in `r2Upload`) needs raw bytes, not
 * text.
 *
 * The Uint8Array output is put straight into the fetch body: RN's network
 * layer natively converts ArrayBuffer/ArrayBufferView bodies to raw bytes
 * (convertRequestBody → {base64} → native decode) — byte-exact on both
 * platforms, where a Blob built from a binary string would be UTF-8-mangled
 * and a Blob from a data-URI XHR read arrives 0 bytes.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// RFC 4648 §5 (URL-safe) — some encoders swap the last two symbols.
const URL_SAFE: Record<string, number> = { '-': 62, '_': 63 };

/** charCode → 6-bit value for the standard alphabet; undefined elsewhere. */
const CODES: (number | undefined)[] = [];
for (let i = 0; i < ALPHABET.length; i++) {
  CODES[ALPHABET.charCodeAt(i)] = i;
}

/**
 * Decodes base64 into bytes. Padding '=' and whitespace are skipped;
 * URL-safe alphabets are accepted; anything else throws. A canonical tail
 * carries 2 or 4 leftover bits that are all zero; a 4k+1 length carries 6
 * (impossible for real base64) and a mangled tail carries non-zero ones —
 * every such string only comes from a truncated export, and decoding it
 * silently would shorten the payload, so both throw: a silently-truncated
 * upload is worse than a failed one.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const data = base64.replace(/[\s=]/g, '');
  if (data.length % 4 === 1) {
    throw new Error('invalid base64 tail — truncated input');
  }
  const out = new Uint8Array(Math.floor((data.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let p = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    let value = CODES[ch.charCodeAt(0)];
    if (value === undefined) value = URL_SAFE[ch];
    if (value === undefined) throw new Error(`invalid base64 character: ${ch}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buffer >> bits) & 0xff;
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error('invalid base64 tail — truncated input');
  }
  return out;
}
