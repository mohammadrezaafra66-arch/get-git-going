import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavigationEntry } from "@/lib/navigation/types";

export const NAVIGATION_FAVORITES_KEY = "afrakala.navigation.favorites.v1";
const FAVORITES_LIMIT = 5;

function readFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NAVIGATION_FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeFavoriteIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAVIGATION_FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Storage may be unavailable in private mode; favorites are optional.
  }
}

export function useNavigationFavorites(visibleEntries: NavigationEntry[]) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteIds());

  useEffect(() => {
    setFavoriteIds(readFavoriteIds());
  }, []);

  const visibleById = useMemo(
    () => new Map(visibleEntries.map((entry) => [entry.id, entry] as const)),
    [visibleEntries],
  );

  const favorites = useMemo(() => {
    const seen = new Set<string>();
    const entries: NavigationEntry[] = [];
    for (const id of favoriteIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = visibleById.get(id);
      if (entry) entries.push(entry);
      if (entries.length >= FAVORITES_LIMIT) break;
    }
    return entries;
  }, [favoriteIds, visibleById]);

  const favoriteIdSet = useMemo(() => new Set(favorites.map((entry) => entry.id)), [favorites]);

  const toggleFavorite = useCallback((entry: NavigationEntry) => {
    if (!entry.pinnable) return;
    setFavoriteIds((current) => {
      const cleaned = current.filter((id, index) => current.indexOf(id) === index);
      const exists = cleaned.includes(entry.id);
      const next = exists
        ? cleaned.filter((id) => id !== entry.id)
        : [entry.id, ...cleaned].slice(0, FAVORITES_LIMIT);
      writeFavoriteIds(next);
      return next;
    });
  }, []);

  return {
    favorites,
    favoriteIdSet,
    toggleFavorite,
    maxFavorites: FAVORITES_LIMIT,
  };
}
