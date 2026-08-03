/**
 * PWA icon generator — Phase 8.1 (D8-7).
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A BUILD STEP
 * The repository contains no brand logo asset (verified 2026-08-04: `public/`
 * held only robots.txt and the Vazirmatn fonts; `src/` had no .svg/logo file).
 * Rather than block the phase, the mark below is drawn from the app's OWN theme
 * colour — `--primary: oklch(0.52 0.12 195)` in src/styles.css, i.e. #007d7e —
 * so the icons are consistent with the running UI instead of arbitrary.
 *
 * TO REPLACE IT WITH THE REAL LOGO
 *   1. Save the logo as `public/icons/source-logo.png` (square, >= 512x512,
 *      transparent background).
 *   2. Run:  node scripts/generate-pwa-icons.mjs
 *      The script picks the file up automatically and composites it over the
 *      same backgrounds, so every size and the maskable safe zone stay correct.
 *   3. Commit the regenerated PNGs.
 *
 * The generated PNGs are COMMITTED. This script is a one-off tool, not part of
 * `npm run build`, so `sharp` never becomes a runtime or build dependency of
 * the app (it is already present transitively in node_modules).
 *
 * Self-host rule 2/13: everything here is local. No network access, no CDN.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "icons");
const SOURCE_LOGO = path.join(OUT_DIR, "source-logo.png");

/** Brand colours, converted from the oklch values in src/styles.css. */
const PRIMARY = "#007d7e";
const ON_PRIMARY = "#f8fdfd";

/**
 * The fallback mark: an isometric package outline. Deliberately drawn as plain
 * geometry and NOT as text — rendering the Persian wordmark would require the
 * Vazirmatn font to be installed system-wide for librsvg, which is not true on
 * a self-hosted Linux box and would make icon generation unreproducible.
 */
const MARK_PATHS = [
  "M50 6 L93 29 L93 75 L50 98 L7 75 L7 29 Z",
  "M7 29 L50 52 L93 29",
  "M50 52 L50 98",
];

function markSvg(size, markRatio, { rounded }) {
  const markSize = size * markRatio;
  const offset = (size - markSize) / 2;
  const scale = markSize / 100;
  const radius = rounded ? Math.round(size * 0.1875) : 0;

  const paths = MARK_PATHS.map((d) => `<path d="${d}" />`).join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${PRIMARY}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${ON_PRIMARY}" ` +
      `stroke-width="7" stroke-linejoin="round" stroke-linecap="round">${paths}</g>` +
      `</svg>`,
    "utf8",
  );
}

function backgroundSvg(size, { rounded }) {
  const radius = rounded ? Math.round(size * 0.1875) : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${PRIMARY}"/>` +
      `</svg>`,
    "utf8",
  );
}

async function hasSourceLogo() {
  try {
    await access(SOURCE_LOGO, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param size      output edge length in px
 * @param markRatio how much of the edge the mark occupies
 * @param rounded   true = rounded square (transparent corners, `purpose: any`),
 *                  false = full bleed (required for `maskable` and for iOS,
 *                  which applies its own squircle mask and would otherwise
 *                  expose transparent corners)
 */
async function render(size, markRatio, { rounded, useSource }) {
  if (!useSource) {
    return sharp(markSvg(size, markRatio, { rounded }))
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const inner = Math.round(size * markRatio);
  const logo = await sharp(SOURCE_LOGO)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp(backgroundSvg(size, { rounded }))
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * `maskable` icons are masked to a circle of 80% diameter on Android. A square
 * mark inscribed in that circle may not exceed 80/sqrt(2) = 56.5% of the edge,
 * so 0.50 leaves real headroom instead of grazing the boundary.
 */
const TARGETS = [
  { file: "icon-96.png", size: 96, ratio: 0.62, rounded: true },
  { file: "icon-128.png", size: 128, ratio: 0.62, rounded: true },
  { file: "icon-192.png", size: 192, ratio: 0.62, rounded: true },
  { file: "icon-256.png", size: 256, ratio: 0.62, rounded: true },
  { file: "icon-384.png", size: 384, ratio: 0.62, rounded: true },
  { file: "icon-512.png", size: 512, ratio: 0.62, rounded: true },
  { file: "maskable-192.png", size: 192, ratio: 0.5, rounded: false },
  { file: "maskable-512.png", size: 512, ratio: 0.5, rounded: false },
  { file: "apple-touch-icon.png", size: 180, ratio: 0.6, rounded: false },
  { file: "favicon-32.png", size: 32, ratio: 0.68, rounded: true },
  { file: "favicon-16.png", size: 16, ratio: 0.72, rounded: true },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const useSource = await hasSourceLogo();

  console.log(
    useSource
      ? `[pwa-icons] Using ${path.relative(ROOT, SOURCE_LOGO)} as the mark.`
      : "[pwa-icons] No source-logo.png found — generating the fallback geometric mark.",
  );

  for (const t of TARGETS) {
    const buf = await render(t.size, t.ratio, { rounded: t.rounded, useSource });
    await writeFile(path.join(OUT_DIR, t.file), buf);
    console.log(`[pwa-icons] ${t.file} (${t.size}x${t.size}, ${buf.length} bytes)`);
  }

  // A scalable favicon so desktop tabs stay crisp without shipping an .ico.
  await writeFile(path.join(OUT_DIR, "icon.svg"), markSvg(512, 0.62, { rounded: true }));
  console.log("[pwa-icons] icon.svg");

  console.log(`[pwa-icons] Done. ${TARGETS.length + 1} files in public/icons/.`);
}

await main();
