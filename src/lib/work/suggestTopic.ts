import { getWorkItem } from "./items";
import { normalizeWorkTokens } from "./similarity";

const STOP_TOKENS = new Set([
  "و",
  "در",
  "از",
  "به",
  "با",
  "که",
  "این",
  "آن",
  "برای",
  "یک",
  "را",
  "تا",
  "یا",
  "هم",
  "the",
  "a",
  "an",
  "of",
  "to",
  "and",
  "for",
  "on",
  "in",
]);

/**
 * Phase 3 helper — suggest a topic title from item ids.
 *
 * AI serverFn path exists (aiChat + usage routes) but requires a new
 * AiUsageKey seed; without that we use a pure heuristic: most common
 * non-stop tokens across titles, falling back to the first item title.
 * No secrets hardcoded.
 */
export async function suggestTopicTitle(itemIds: string[]): Promise<string> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return "موضوع جدید";

  const titles: string[] = [];
  for (const id of ids) {
    const item = await getWorkItem(id);
    if (item?.title) titles.push(item.title.trim());
  }
  if (titles.length === 0) return "موضوع جدید";

  const freq = new Map<string, number>();
  for (const title of titles) {
    for (const tok of normalizeWorkTokens(title)) {
      if (STOP_TOKENS.has(tok)) continue;
      freq.set(tok, (freq.get(tok) ?? 0) + 1);
    }
  }

  const ranked = Array.from(freq.entries())
    .filter(([, n]) => n >= 2 || titles.length === 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fa"));

  if (ranked.length > 0) {
    const picked = ranked.slice(0, 4).map(([t]) => t);
    const suggestion = picked.join(" ").trim();
    if (suggestion) return suggestion.slice(0, 80);
  }

  return titles[0].slice(0, 80);
}
