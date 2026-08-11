import { useEffect, useMemo, useState } from "react";
import type { NavigationEntry } from "@/lib/navigation/types";

export const NAVIGATION_RECENT_KEY = "afrakala.navigation.recent.v1";
const RECENT_LIMIT = 5;

function readRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NAVIGATION_RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAVIGATION_RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Recent destinations are a convenience feature; ignore storage failures.
  }
}

export function useNavigationRecent(currentPath: string, visibleEntries: NavigationEntry[]) {
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentIds());

  useEffect(() => {
    setRecentIds(readRecentIds());
  }, []);

  const visibleById = useMemo(
    () => new Map(visibleEntries.map((entry) => [entry.id, entry] as const)),
    [visibleEntries],
  );

  useEffect(() => {
    const current = visibleEntries.find(
      (entry) => entry.recentEligible && entry.route === currentPath,
    );
    if (!current) return;
    setRecentIds((ids) => {
      const next = [current.id, ...ids.filter((id) => id !== current.id)].slice(0, RECENT_LIMIT);
      writeRecentIds(next);
      return next;
    });
  }, [currentPath, visibleEntries]);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const entries: NavigationEntry[] = [];
    for (const id of recentIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = visibleById.get(id);
      if (entry?.recentEligible) entries.push(entry);
      if (entries.length >= RECENT_LIMIT) break;
    }
    return entries;
  }, [recentIds, visibleById]);

  return { recent, maxRecent: RECENT_LIMIT };
}
