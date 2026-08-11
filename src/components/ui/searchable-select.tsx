import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  noneLabel?: string | null;
  disabled?: boolean;
  /** Optional: render an extra action (e.g. "create new") at the bottom of the list. */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
  className?: string;
}

const normalizeForSearch = (value: string) => normalizeSearchText(value).toLowerCase();

/**
 * RTL-friendly searchable select built on shadcn Command + Popover.
 * Falls back to a "— none —" option when `noneLabel` is provided.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "انتخاب کنید",
  searchPlaceholder = "جستجو...",
  emptyText = "موردی یافت نشد",
  noneLabel,
  disabled,
  onCreate,
  createLabel,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const normalizedQuery = normalizeForSearch(query.trim());
  const exactMatch = React.useMemo(
    () =>
      normalizedQuery.length > 0 &&
      options.some((o) => normalizeForSearch(o.label) === normalizedQuery),
    [options, normalizedQuery],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          shouldFilter={true}
          filter={(itemValue, search) => {
            const normalizedItem = normalizeForSearch(itemValue);
            const normalizedSearch = normalizeForSearch(search);
            return normalizedItem.includes(normalizedSearch) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {noneLabel ? (
                <CommandItem
                  value={`__none__ ${noneLabel}`}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn("ms-auto h-4 w-4", value === null ? "opacity-100" : "opacity-0")}
                  />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "ms-auto h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && normalizedQuery.length > 0 && !exactMatch ? (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${query}`}
                  onSelect={async () => {
                    await onCreate(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="ms-auto h-4 w-4" />
                  <span className="truncate">
                    {createLabel ? createLabel(query.trim()) : `افزودن: ${query.trim()}`}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
