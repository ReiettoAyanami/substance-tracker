/**
 * A new clientRef: the UUID (v4) a create sends so that sending it again never makes a second row
 * (design.md, Appendix B; design-android.md, "clientRef"). Built on `crypto.getRandomValues()`, not
 * `crypto.randomUUID()`: that one exists only in a secure context (https or localhost), and an
 * instance opened over plain http on a home network has none.
 */
export function newClientRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What a clientRef made here looks like: a UUID v4 (the API takes any UUID). */
export const CLIENT_REF_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
