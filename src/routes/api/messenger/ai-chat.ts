// Phase 6 — Server route SSE برای دستیار هوشمند (Ollama self-hosted)
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const bodySchema = z.object({
  group_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(4000),
});

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const CHAT_TIMEOUT_MS = 120_000;
const SYSTEM_PROMPT =
  "تو دستیار هوشمند AfraKala هستی. فقط به فارسی پاسخ بده. پاسخ‌هایت دقیق، مختصر، حرفه‌ای و مفید برای کسب‌وکار باشد.";

function sseEvent(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const Route = createFileRoute("/api/messenger/ai-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: authHeader } },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        let parsed: z.infer<typeof bodySchema>;
        try {
          const json = await request.json();
          parsed = bodySchema.parse(json);
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const groupId = parsed.group_id ?? null;

        // اگر group_id داده شد، عضویت اعتبارسنجی شود
        if (groupId) {
          const { data: membership } = await supabase
            .from("messenger_group_members")
            .select("group_id")
            .eq("group_id", groupId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!membership) return new Response("Forbidden", { status: 403 });
        }

        // بارگیری history
        const history: ChatMessage[] = [];
        if (groupId) {
          const { data: msgs } = await supabase
            .from("messenger_messages")
            .select("content, sender_id, type, created_at")
            .eq("group_id", groupId)
            .eq("type", "text")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(20);
          const ordered = [...(msgs ?? [])].reverse();
          for (const m of ordered) {
            const content = (m.content ?? "").trim();
            if (!content) continue;
            history.push({
              role: m.sender_id === userId ? "user" : "user",
              content: `[${m.sender_id === userId ? "من" : "همکار"}] ${content}`,
            });
          }
        }

        let aiHistQuery = supabase
          .from("ai_conversations")
          .select("role, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        aiHistQuery = groupId
          ? aiHistQuery.eq("group_id", groupId)
          : aiHistQuery.is("group_id", null);
        const { data: aiHist } = await aiHistQuery;
        const aiOrdered = [...(aiHist ?? [])].reverse();
        for (const h of aiOrdered) {
          if (h.role === "user" || h.role === "assistant") {
            history.push({ role: h.role, content: h.content });
          }
        }

        // درج user message
        await supabase.from("ai_conversations").insert({
          user_id: userId,
          group_id: groupId,
          role: "user",
          content: parsed.message,
        });

        const apiUrl = process.env.OLLAMA_API_URL?.trim();
        const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2:8b";

        const sseHeaders = {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        } as const;

        if (!apiUrl) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(sseEvent({ ok: false, reason: "disabled" })),
              );
              controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
              controller.close();
            },
          });
          return new Response(stream, { headers: sseHeaders });
        }

        const messages: ChatMessage[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: parsed.message },
        ];

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

        const ollamaHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const ollamaApiKey = process.env.OLLAMA_API_KEY?.trim();
        if (ollamaApiKey) {
          ollamaHeaders.Authorization = `Bearer ${ollamaApiKey}`;
        }

        let ollamaRes: Response;
        try {
          ollamaRes = await fetch(apiUrl.replace(/\/+$/, "") + "/api/chat", {
            method: "POST",
            headers: ollamaHeaders,
            body: JSON.stringify({ model, messages, stream: true }),
            signal: controller.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          const reason = (e as Error)?.name === "AbortError" ? "timeout" : "fetch_failed";
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(sseEvent({ error: reason })));
              c.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
              c.close();
            },
          });
          return new Response(stream, { headers: sseHeaders });
        }

        if (!ollamaRes.ok || !ollamaRes.body) {
          clearTimeout(timer);
          const status = ollamaRes.status;
          const error = status === 403 ? "ollama_forbidden" : `http_${status}`;
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(sseEvent({ error })));
              c.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
              c.close();
            },
          });
          return new Response(stream, { headers: sseHeaders });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = ollamaRes.body.getReader();
        let assistantFull = "";

        const stream = new ReadableStream({
          async start(c) {
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let nl = buffer.indexOf("\n");
                while (nl !== -1) {
                  const line = buffer.slice(0, nl).trim();
                  buffer = buffer.slice(nl + 1);
                  if (line) {
                    try {
                      const j = JSON.parse(line) as {
                        message?: { content?: string };
                        done?: boolean;
                        error?: string;
                      };
                      if (j.error) {
                        c.enqueue(encoder.encode(sseEvent({ error: j.error })));
                      } else {
                        const chunk = j.message?.content ?? "";
                        if (chunk) {
                          assistantFull += chunk;
                          c.enqueue(encoder.encode(sseEvent({ delta: chunk })));
                        }
                      }
                    } catch {
                      // ignore malformed line
                    }
                  }
                  nl = buffer.indexOf("\n");
                }
              }
              c.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
            } catch (e) {
              const reason = (e as Error)?.name === "AbortError" ? "timeout" : "disconnected";
              c.enqueue(encoder.encode(sseEvent({ error: reason })));
              c.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
            } finally {
              clearTimeout(timer);
              try {
                reader.releaseLock();
              } catch {
                // noop
              }
              const finalText = assistantFull.trim();
              if (finalText) {
                await supabase.from("ai_conversations").insert({
                  user_id: userId,
                  group_id: groupId,
                  role: "assistant",
                  content: finalText,
                  model,
                });
              }
              c.close();
            }
          },
        });

        return new Response(stream, { headers: sseHeaders });
      },
    },
  },
});
