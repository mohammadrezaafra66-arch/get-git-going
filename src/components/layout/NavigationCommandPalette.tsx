import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getVisibleNavigationEntries } from "@/lib/navigation/selectors";
import { searchNavigationEntries } from "@/lib/navigation/search";
import { useNavigationFavorites } from "@/hooks/navigation/useNavigationFavorites";
import { useNavigationRecent } from "@/hooks/navigation/useNavigationRecent";
import type { NavigationEntry } from "@/lib/navigation/types";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function uniqueEntries(entries: NavigationEntry[]): NavigationEntry[] {
  const seen = new Set<string>();
  const out: NavigationEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function NavigationCommandPalette() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => getVisibleNavigationEntries(roles), [roles]);
  const { favorites } = useNavigationFavorites(visible);
  const { recent } = useNavigationRecent(location.pathname, visible);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.ctrlKey && !event.metaKey)) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const searchResults = useMemo(
    () => searchNavigationEntries(visible, query).map((result) => result.entry),
    [visible, query],
  );
  const suggested = useMemo(
    () => uniqueEntries([...favorites, ...recent, ...visible]).slice(0, 8),
    [favorites, recent, visible],
  );
  const hasQuery = query.trim().length > 0;

  const runNavigation = (entry: NavigationEntry) => {
    setOpen(false);
    navigate({ to: entry.route });
  };

  const renderCommand = (entry: NavigationEntry, kind: "navigation" | "favorite" | "recent") => (
    <CommandItem
      key={`${kind}-${entry.id}`}
      value={`${entry.title} ${entry.route} ${entry.keywords.join(" ")}`}
      onSelect={() => runNavigation(entry)}
      className="flex-row-reverse justify-between"
    >
      <div className="flex min-w-0 items-center gap-2">
        <entry.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{entry.title}</span>
      </div>
      <CommandShortcut className="ml-0 mr-auto lowercase">{entry.route}</CommandShortcut>
    </CommandItem>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div dir="rtl">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="جستجوی صفحه یا دستور..."
          aria-label="جستجوی دستورها"
        />
        <CommandList>
          <CommandEmpty>موردی پیدا نشد</CommandEmpty>
          {hasQuery ? (
            <CommandGroup heading="نتایج">
              {searchResults.map((entry) => renderCommand(entry, "navigation"))}
            </CommandGroup>
          ) : (
            <>
              {favorites.length > 0 && (
                <CommandGroup heading="میانبرهای من">
                  {favorites.map((entry) => renderCommand(entry, "favorite"))}
                </CommandGroup>
              )}
              {recent.length > 0 && (
                <CommandGroup heading="آخرین استفاده‌ها">
                  {recent.map((entry) => renderCommand(entry, "recent"))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup heading="پیشنهادها">
                {suggested.map((entry) => renderCommand(entry, "navigation"))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </div>
    </CommandDialog>
  );
}
