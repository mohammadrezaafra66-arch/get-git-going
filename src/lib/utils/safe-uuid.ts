/**
 * safeRandomUUID — a UUID v4 generator that works in every browser context
 * we deploy to, including LAN self-host over plain HTTP (192.168.x.x) where
 * `crypto.randomUUID` is unavailable because the origin is not a Secure Context.
 *
 * Preference order:
 *   1. `crypto.randomUUID()`  — native, available on HTTPS / localhost.
 *   2. `crypto.getRandomValues()` — available on virtually every modern
 *      browser regardless of Secure Context; produces a spec-compliant v4.
 *   3. `Math.random()` — last-resort fallback. NOT cryptographically strong.
 *      Only ever used to name storage objects; never as a token/secret.
 */
export function safeRandomUUID(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // fall through
    }
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC 4122 §4.4: set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
