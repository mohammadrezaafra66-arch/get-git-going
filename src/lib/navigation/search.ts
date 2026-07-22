import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import type { NavigationEntry, NavigationSearchResult } from "./types";

export function normalizeNavigationSearch(input: string | null | undefined): string {
  return normalizeSearchText(input).toLowerCase();
}

export function searchNavigationEntries(
  entries: NavigationEntry[],
  query: string | null | undefined,
): NavigationSearchResult[] {
  const normalizedQuery = normalizeNavigationSearch(query);
  if (!normalizedQuery) return [];

  const results: NavigationSearchResult[] = [];

  for (const entry of entries) {
    const title = normalizeNavigationSearch(entry.title);
    const description = normalizeNavigationSearch(entry.description);
    const route = normalizeNavigationSearch(entry.route);
    const keywords = entry.keywords.map(normalizeNavigationSearch);

    if (title === normalizedQuery) {
      results.push({ entry, score: 100, reason: "title-exact" });
    } else if (title.startsWith(normalizedQuery)) {
      results.push({ entry, score: 90, reason: "title-prefix" });
    } else if (title.includes(normalizedQuery)) {
      results.push({ entry, score: 80, reason: "title-contains" });
    } else if (
      keywords.some((keyword) => keyword === normalizedQuery || keyword.startsWith(normalizedQuery))
    ) {
      results.push({ entry, score: 70, reason: "keyword" });
    } else if (description.includes(normalizedQuery)) {
      results.push({ entry, score: 50, reason: "description" });
    } else if (route.includes(normalizedQuery)) {
      results.push({ entry, score: 40, reason: "route" });
    }
  }

  return results.sort(
    (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "fa"),
  );
}
