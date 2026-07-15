/**
 * Normalize search text for consistent matching across Persian / English / numeric input.
 *
 * - Removes ZWNJ (نیم‌فاصله, U+200C) and zero-width chars
 * - Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII (0-9)
 * - Normalizes Arabic letters ي/ك to Persian ی/ک
 * - Removes Arabic diacritics (tashkeel)
 * - Collapses whitespace and trims
 */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);

  // Persian digits ۰-۹ -> 0-9
  s = s.replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
  // Arabic-Indic digits ٠-٩ -> 0-9
  s = s.replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));

  // Arabic letters -> Persian equivalents
  s = s.replace(/\u064A/g, "\u06CC"); // ي -> ی
  s = s.replace(/\u0649/g, "\u06CC"); // ى -> ی
  s = s.replace(/\u0643/g, "\u06A9"); // ك -> ک

  // ZWNJ / zero-width chars -> regular space
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, " ");

  // Arabic tashkeel (diacritics) -> remove
  s = s.replace(/[\u064B-\u0652\u0670]/g, "");

  // Remove all whitespace so "لباس شویی" matches "لباسشویی" (per product-search spec)
  s = s.replace(/\s+/g, "").trim();

  return s;
}
