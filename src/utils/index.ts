// Utility functions and helpers — re-exports each utils module's public API.
// Date math (IST): istDate · phone/map deep links: linking ·
// idempotency keys for mutating requests: idempotency ·
// raw PUT of file bytes to a presigned R2 URL: r2Upload ·
// base64 → bytes without Buffer/atob: base64 ·
// "our own abort, not a real error" detection: isAbort

export {
  daysOverdue,
  formatIstDateLabel,
  isSameIstDay,
  istDayStartMs,
} from './istDate';
// Coarse "5m ago" feed labels (falls back to a calendar date past 4 weeks)
export { relativeTime } from './relativeTime';
export { openMaps, openTel } from './linking';
export { generateIdempotencyKey } from './idempotency';
export { putToPresignedUrl } from './r2Upload';
export { base64ToUint8Array } from './base64';
export { isAbort } from './isAbort';
