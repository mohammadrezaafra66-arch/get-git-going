import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatJalaliTime, formatJalaliDateTime } from "@/lib/messenger/format";
import type { MessengerMessage } from "@/hooks/messenger/useMessengerMessages";
import { useAuth } from "@/lib/auth/AuthProvider";

function useSenderProfiles(ids: string[]) {
  return useQuery({
    queryKey: ["messenger-profiles", ids.sort().join(",")],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const map = new Map<string, string>();
      for (const p of data ?? []) map.set(p.id, p.full_name ?? "");
      return map;
    },
  });
}

export function MessageList({ messages }: { messages: MessengerMessage[] }) {
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);

  const senderIds = useMemo(
    () => Array.from(new Set(messages.map((m) => m.sender_id).filter((x): x is string => !!x))),
    [messages],
  );
  const { data: nameMap } = useSenderProfiles(senderIds);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <ScrollArea className="flex-1 px-3 py-4">
      <div className="space-y-3">
        {messages.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">هنوز پیامی نیست</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const name = (m.sender_id && nameMap?.get(m.sender_id)) || "کاربر";
          const initial = name?.charAt(0) || "؟";
          return (
            <div key={m.id} className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[75%] space-y-1", mine ? "items-start" : "items-end")}>
                {!mine && <div className="px-1 text-xs text-muted-foreground">{name}</div>}
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words",
                    mine
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm",
                  )}
                >
                  {m.content}
                </div>
                <div
                  className="px-1 text-[10px] text-muted-foreground"
                  dir="ltr"
                  title={formatJalaliDateTime(m.created_at)}
                >
                  {formatJalaliTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}