import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSemanticSearch } from "@/hooks/messenger/useSemanticSearch";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { cn } from "@/lib/utils";

export function SemanticSearchBar({ groupId }: { groupId: string | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const search = useSemanticSearch(groupId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setOpen(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOpen(true);
      search.mutate(q.trim());
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, groupId]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && q.trim()) {
      setOpen(true);
      search.mutate(q.trim());
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQ("");
    }
  };

  const scrollTo = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      }, 2000);
    }
    setOpen(false);
  };

  const data = search.data;
  const disabled = data && !data.ok && data.reason === "disabled";

  return (
    <div className="relative border-b bg-card/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="جست‌وجوی معنایی…"
          className="h-8 flex-1"
          maxLength={500}
        />
        {search.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {q && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {open && (
        <div className="absolute end-3 start-3 top-full z-20 mt-1 max-h-80 overflow-auto rounded-md border bg-popover p-2 shadow-md">
          {search.isPending && (
            <div className="p-3 text-center text-xs text-muted-foreground">در حال جست‌وجو…</div>
          )}
          {!search.isPending && disabled && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              جست‌وجوی معنایی فعال نیست
            </div>
          )}
          {!search.isPending && data?.ok && data.hits.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">نتیجه‌ای یافت نشد</div>
          )}
          {!search.isPending && data?.ok && data.hits.length > 0 && (
            <ul className="space-y-1">
              {data.hits.map((h) => (
                <li key={h.message_id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(h.message_id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md px-2 py-2 text-right hover:bg-accent",
                    )}
                  >
                    <span className="line-clamp-2 text-xs text-foreground">{h.content}</span>
                    <span
                      className="flex justify-between text-[10px] text-muted-foreground"
                      dir="ltr"
                    >
                      <span>{(h.similarity * 100).toFixed(0)}%</span>
                      <span>{formatJalaliDateTime(h.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}