// Polyfill for `crypto.randomUUID` in non-secure contexts (e.g. self-host over HTTP LAN).
// Browsers only expose `crypto.randomUUID` on secure origins (HTTPS/localhost).
// supabase-js (storage/realtime) and other libs call it when generating ids —
// without it, uploads fail with `crypto.randomUUID is not a function`.
//
// This module is defensive: it handles three cases
//   1. `crypto` exists and has `randomUUID` → leave it alone.
//   2. `crypto` exists but no `randomUUID` → add one (from `getRandomValues`
//      when available, otherwise from `Math.random`).
//   3. `crypto` is missing entirely → install a minimal `crypto` shim
//      exposing `randomUUID` and `getRandomValues`.
// Assignment is wrapped in try/catch because `crypto` may be a read-only host
// object; if direct assignment fails we replace the whole `crypto` object on
// `globalThis` with a wrapper that keeps the original methods plus our
// `randomUUID`.

type UUIDv4 = `${string}-${string}-${string}-${string}-${string}`;

function fillRandomWithMathRandom(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

function makeRandomUUID(source: Crypto | undefined): () => UUIDv4 {
  return function randomUUID(): UUIDv4 {
    const b = new Uint8Array(16);
    if (source && typeof source.getRandomValues === "function") {
      try {
        source.getRandomValues(b);
      } catch {
        fillRandomWithMathRandom(b);
      }
    } else {
      fillRandomWithMathRandom(b);
    }
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h: string[] = [];
    for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h
      .slice(6, 8)
      .join("")}-${h.slice(8, 10).join("")}-${h
      .slice(10, 16)
      .join("")}` as UUIDv4;
  };
}

function installOn(target: Record<string, unknown>): void {
  const existing = target.crypto as Crypto | undefined;

  // Case 1 — native randomUUID exists; verify it actually works (some
  // insecure contexts expose it but throw). Wrap on failure.
  if (existing && typeof existing.randomUUID === "function") {
    try {
      existing.randomUUID();
      return;
    } catch {
      // fall through to reassignment
    }
  }

  const patched = makeRandomUUID(existing);

  if (existing) {
    try {
      (existing as unknown as { randomUUID: () => UUIDv4 }).randomUUID = patched;
      return;
    } catch {
      // read-only crypto object — replace it wholesale below
    }
    try {
      Object.defineProperty(target, "crypto", {
        configurable: true,
        value: {
          ...existing,
          getRandomValues: existing.getRandomValues
            ? existing.getRandomValues.bind(existing)
            : (bytes: Uint8Array) => {
                fillRandomWithMathRandom(bytes);
                return bytes;
              },
          subtle: (existing as Crypto).subtle,
          randomUUID: patched,
        },
      });
    } catch {
      // last-resort: leave it; nothing more we can do
    }
    return;
  }

  // Case 3 — no crypto at all: install a minimal shim.
  try {
    Object.defineProperty(target, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (bytes: Uint8Array) => {
          fillRandomWithMathRandom(bytes);
          return bytes;
        },
        randomUUID: patched,
      },
    });
  } catch {
    // ignore
  }
}

try {
  installOn(globalThis as unknown as Record<string, unknown>);
} catch {
  // never throw from a polyfill
}

export {};
