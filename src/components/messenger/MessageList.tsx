import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatJalaliTime, formatJalaliDateTime } from "@/lib/messenger/format";
import type { MessengerMessage } from "@/hooks/messenger/useMessengerMessages";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AttachmentBubble } from "./AttachmentBubble";
import { AudioPlayer } from "./AudioPlayer";
import { getExt, getRuleByExtAndMime } from "@/lib/messenger/attachment-rules";
import { useInquiries } from "@/hooks/messenger/useInquiries";
import { InquiryCard } from "./InquiryCard";

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
  const groupId = messages[0]?.group_id ?? null;
  const { data: inquiries } = useInquiries(groupId);
  const inquiryByMessageId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof inquiries>[number]>();
    for (const i of inquiries ?? []) {
      if (i.message_id) map.set(i.message_id, i);
    }
    return map;
  }, [inquiries]);

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
          const attachments = m.attachments ?? [];
          const textContent = (m.content ?? "").trim();
          const hasText = textContent.length > 0;
          if (m.type === "inquiry") {
            const inquiry = inquiryByMessageId.get(m.id);
            return (
              <div
                key={m.id}
                data-message-id={m.id}
                className="flex justify-center"
              >
                <div className="w-full max-w-[85%]">
                  {inquiry ? (
                    <InquiryCard inquiry={inquiry} currentUserId={user?.id ?? null} />
                  ) : (
                    <div className="rounded-md border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                      در حال بارگذاری کارت استعلام…
                    </div>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              data-message-id={m.id}
              className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[75%] space-y-1", mine ? "items-start" : "items-end")}>
                {!mine && <div className="px-1 text-xs text-muted-foreground">{name}</div>}
                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((a) => {
                      const rule = getRuleByExtAndMime(getExt(a.file_name), a.file_type ?? "");
                      if (rule?.kind === "audio") {
                        return <AudioPlayer key={a.id} attachment={a} />;
                      }
                      return <AttachmentBubble key={a.id} attachment={a} />;
                    })}
                  </div>
                )}
                {hasText && (
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words",
                      mine
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm",
                    )}
                  >
                    {attachments.some((a) => {
                      const r = getRuleByExtAndMime(getExt(a.file_name), a.file_type ?? "");
                      return r?.kind === "audio";
                    }) ? (
                      <span>📝 رونویسی: {textContent}</span>
                    ) : (
                      textContent
                    )}
                  </div>
                )}
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