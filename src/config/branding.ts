/**
 * Canonical platform branding — single source of truth for runtime UI.
 * Do not hardcode myafrakala.ir elsewhere except:
 * - this file
 * - tests asserting the exact value
 * - static public/manifest.webmanifest (cannot import TS)
 */

export const BRANDING = {
  platformName: "myafrakala.ir",
  shortName: "myafrakala.ir",
  domain: "myafrakala.ir",
  displayNameFa: "myafrakala.ir",
  titleTemplate: "%s | myafrakala.ir",
  defaultTitle: "myafrakala.ir",
  applicationName: "myafrakala.ir",
  /** Short product tagline under the brand (not the brand itself). */
  taglineFa: "سامانه یکپارچه مدیریت سازمانی",
  publicOrigin: "https://myafrakala.ir",
  /** Default SEO description; always includes the platform name once. */
  metaDescriptionFa: "سامانه یکپارچه مدیریت محصولات، قیمت‌گذاری، فروش و فاکتور myafrakala.ir.",
} as const;

export type Branding = typeof BRANDING;

/** Browser / meta title. Avoids `myafrakala.ir | myafrakala.ir`. */
export function getPageTitle(pageTitle?: string | null): string {
  const page = (pageTitle ?? "").trim();
  if (!page || page === BRANDING.platformName) return BRANDING.defaultTitle;
  if (page.includes(BRANDING.platformName)) return page;
  return BRANDING.titleTemplate.replace("%s", page);
}

export function getBrandLabel(): string {
  return BRANDING.displayNameFa;
}

/** Prefix a download base name with the brand when a branded filename is desired. */
export function getBrandedFileName(baseName: string): string {
  const base = baseName.trim().replace(/^[/\\]+/, "");
  if (!base) return BRANDING.shortName;
  if (base.toLowerCase().startsWith(BRANDING.shortName.toLowerCase())) return base;
  return `${BRANDING.shortName}-${base}`;
}
