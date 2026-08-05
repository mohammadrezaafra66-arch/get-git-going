import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useAiConversation,
  clearAiConversation,
  type AiTurn,
} from "@/hooks/messenger/useAiConversation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BRANDING } from "@/config/branding";

export function AiAssistantDrawer({
  open,
  onOpenChange,
  groupId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: history } = useAiConversation(groupId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveAssistant, setLiveAssistant] = useState<string>("");
  const [disabled, setDisabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history?.length, liveAssistant]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
      setLiveAssistant("");
    }
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);
    setLiveAssistant("");
    setDisabled(false);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error("ابتدا وارد شوید");
      setStreaming(false);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/messenger/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ group_id: groupId, message: text }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        toast.error(`ارتباط با دستیار برقرار نشد (کد ${res.status})`);
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
          if (dataLine) {
            const payload = dataLine.slice(5).trim();
            try {
              const j = JSON.parse(payload) as {
                delta?: string;
                error?: string;
                ok?: boolean;
                reason?: string;
              };
              if (j.delta) {
                full += j.delta;
                setLiveAssistant(full);
              } else if (j.ok === false && j.reason === "disabled") {
                setDisabled(true);
              } else if (j.error) {
                const reason = j.error;
                let msg = `خطا در دستیار: ${reason}`;
                if (reason === "timeout") {
                  msg = "پاسخ دستیار طول کشید؛ دوباره تلاش کنید";
                } else if (reason === "fetch_failed") {
                  msg =
                    "دسترسی به سرویس دستیار محلی برقرار نشد؛ تنظیمات OLLAMA_API_URL را بررسی کنید";
                } else if (reason === "ollama_forbidden" || reason === "http_403") {
                  msg =
                    "سرور Ollama دسترسی را رد کرد؛ تنظیمات آدرس، فایروال، reverse proxy یا کلید دسترسی را بررسی کنید";
                }
                toast.error(msg);
              }
            } catch {
              // ignore
            }
          }
          idx = buffer.indexOf("\n\n");
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error("خطا در ارتباط با دستیار");
      }
    } finally {
      setStreaming(false);
      setLiveAssistant("");
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ["ai-conversation", user?.id, groupId] });
    }
  };

  const onClear = async () => {
    if (!user?.id) return;
    try {
      await clearAiConversation(user.id, groupId);
      qc.invalidateQueries({ queryKey: ["ai-conversation", user.id, groupId] });
      toast.success("گفتگو پاک شد");
    } catch {
      toast.error("پاک کردن گفتگو ناموفق بود");
    }
  };

  const turns: AiTurn[] = history ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            دستیار هوشمند {BRANDING.displayNameFa}
          </SheetTitle>
          <SheetDescription className="text-xs">
            گفتگو با ارائه‌دهنده هوش مصنوعی تنظیم‌شده در پنل مدیریت.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-3">
            {turns.length === 0 && !streaming && !disabled && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                سوال یا درخواست خود را بنویسید
              </div>
            )}
            {disabled && (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                دستیار هوشمند هنوز فعال نیست
              </div>
            )}
            {turns.map((t) => (
              <Bubble key={t.id} role={t.role} content={t.content} />
            ))}
            {streaming && <Bubble role="assistant" content={liveAssistant || "…"} streaming />}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <div className="border-t p-3">
          <div className="mb-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={streaming || turns.length === 0}
            >
              <Trash2 className="ms-1 h-3 w-3" />
              پاک کردن گفتگو
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={4000}
              disabled={streaming}
              placeholder="پیام خود را برای دستیار بنویسید…"
              className="min-h-12 resize-none"
            />
            <Button size="icon" onClick={() => void send()} disabled={streaming || !input.trim()}>
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}) {
  const mine = role === "user";
  const displayContent = mine ? content : normalizeAssistantText(content);
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        dir="rtl"
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-right text-sm leading-7 [unicode-bidi:plaintext]",
          mine
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm",
          streaming && "opacity-90",
        )}
      >
        {displayContent}
      </div>
    </div>
  );
}

function normalizeAssistantText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*(\d+)\.\s+/gm, (_, n: string) => `${toPersianDigits(n)}) `);
}

function toPersianDigits(input: string) {
  return input.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)] ?? d);
}
