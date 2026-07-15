// Polyfill for `crypto.randomUUID` in non-secure contexts (e.g. self-host over HTTP LAN).
// Browsers only expose `crypto.randomUUID` on secure origins (HTTPS/localhost).
// supabase-js realtime and other libs call it when creating channel ids.
// `crypto.getRandomValues` is available even in non-secure contexts, so we build a v4 UUID from it.

if (
  typeof globalThis.crypto !== "undefined" &&
  typeof globalThis.crypto.getRandomValues === "function" &&
  typeof (globalThis.crypto as Crypto).randomUUID !== "function"
) {
  (globalThis.crypto as Crypto).randomUUID = function randomUUID() {
    const b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h
      .slice(6, 8)
      .join("")}-${h.slice(8, 10).join("")}-${h
      .slice(10, 16)
      .join("")}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

export {};