/**
 * Shared AI provider client — SERVER ONLY.
 *
 * Before this existed, five call sites each hardcoded ai.gateway.lovable.dev
 * with their own fetch, their own model name and their own error handling.
 * This module centralises: which provider to use, in what order, what counts
 * as a reason to try the next one, and what an admin gets to see afterwards.
 *
 * Never import this from browser code — it reads provider keys.
 *
 * Ordering: providers are tried in ascending `priority`. The seeded LAN Ollama
 * sits at 10, so it goes first whenever it is active and declares the
 * capability; a keyed provider registered later at the default 100 is the
 * fallback. "Reachable" is not pre-checked with a ping — a ping doubles the
 * latency and can still be stale by the time the real call goes out, so the
 * real call IS the check and a connection failure simply moves to the next
 * provider.
 *
 * Failover rule: only when a provider produced NO answer. A 200 response is
 * final even if the answer looks poor, because retrying it elsewhere means
 * paying twice and getting two different answers to one question.
 *
 * Nothing here throws. Every entry point returns an AiResult, so a caller with
 * no working provider degrades instead of crashing a page.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AI_FAILURE_FA,
  healthStatusFor,
  isFailoverReason,
  type AiAttempt,
  type AiCapability,
  type AiChatOptions,
  type AiEmbedOptions,
  type AiEmbedResult,
  type AiFailureReason,
  type AiProvider,
  type AiResult,
  type AiVisionOptions,
} from "./types";

const DEFAULT_TIMEOUT_MS = 120_000;

interface ProviderRow {
  id: string;
  name: string;
  label: string;
  kind: string;
  base_url: string;
  is_active: boolean;
  priority: number;
  chat_model: string | null;
  embed_model: string | null;
  vision_model: string | null;
  capabilities: string[] | null;
  key_prefix: string | null;
  secret_id: string | null;
  notes: string | null;
}

function toProvider(row: ProviderRow): AiProvider {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    kind: row.kind === "ollama" ? "ollama" : "openai_compatible",
    base_url: row.base_url,
    is_active: row.is_active,
    priority: row.priority,
    chat_model: row.chat_model,
    embed_model: row.embed_model,
    vision_model: row.vision_model,
    capabilities: (row.capabilities ?? []).filter(
      (c): c is AiCapability => c === "chat" || c === "embeddings" || c === "vision",
    ),
    key_prefix: row.key_prefix,
    has_key: row.secret_id != null,
    notes: row.notes,
  };
}

/** Providers that declare `capability`, active, best priority first. */
export async function listProvidersFor(capability: AiCapability): Promise<AiProvider[]> {
  const { data, error } = await supabaseAdmin
    .from("ai_providers" as never)
    .select(
      "id,name,label,kind,base_url,is_active,priority,chat_model,embed_model,vision_model,capabilities,key_prefix,secret_id,notes",
    )
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as ProviderRow[])
    .map(toProvider)
    .filter((p) => p.capabilities.includes(capability));
}

/**
 * Provider + key for callers that cannot use aiChat/aiEmbed/aiVision because
 * they need the raw response — today that is only the SSE chat route, which
 * must stream tokens as they arrive and would lose that by going through the
 * buffered helpers.
 *
 * Such callers still get central configuration, provider order and the vaulted
 * key; what they give up is automatic failover, so they should report health
 * themselves via recordProviderHealth.
 */
export async function resolveProviderForCapability(
  capability: AiCapability,
): Promise<{ provider: AiProvider; key: string | null } | null> {
  const providers = await listProvidersFor(capability);
  const provider = providers[0];
  if (!provider) return null;
  return { provider, key: provider.has_key ? await getKey(provider.id) : null };
}

export async function recordProviderHealth(
  providerId: string,
  capability: AiCapability,
  reason: AiFailureReason | "ok",
  detail: string | null,
  latencyMs: number | null,
): Promise<void> {
  const status = reason === "ok" ? "ok" : healthStatusFor(reason);
  await recordHealth(
    providerId,
    capability,
    status,
    reason === "ok" ? null : reason,
    detail,
    latencyMs,
  );
}

async function getKey(providerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "ai_get_provider_key" as never,
    {
      p_provider_id: providerId,
    } as never,
  );
  if (error) return null;
  return (data as string | null) ?? null;
}

async function recordHealth(
  providerId: string,
  capability: AiCapability,
  status: string,
  errorCode: string | null,
  errorMessage: string | null,
  latencyMs: number | null,
): Promise<void> {
  // Health is observability, not correctness. A failure to write it must never
  // turn a working AI call into a failed one.
  try {
    await supabaseAdmin.rpc(
      "ai_record_provider_health" as never,
      {
        p_provider_id: providerId,
        p_capability: capability,
        p_status: status,
        p_error_code: errorCode,
        p_error_message: errorMessage ? errorMessage.slice(0, 500) : null,
        p_latency_ms: latencyMs,
      } as never,
    );
  } catch {
    /* ignore */
  }
}

function reasonForStatus(status: number): AiFailureReason {
  if (status === 429) return "rate_limited";
  if (status === 402) return "credit_exhausted";
  if (status === 401 || status === 403) return "unauthorized";
  if (status >= 500) return "server_error";
  return "bad_request";
}

function reasonForThrown(err: unknown): AiFailureReason {
  const name = (err as { name?: string } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  return "unreachable";
}

interface CallOutcome<T> {
  ok: boolean;
  value?: T;
  reason?: AiFailureReason;
  status: number | null;
  detail: string | null;
}

/** Never lets a provider error message escape — it can contain the key. */
function safeDetail(text: string, key: string | null): string {
  let out = text.slice(0, 400);
  if (key && key.length >= 8) out = out.split(key).join("***");
  return out;
}

async function postJson(
  url: string,
  body: unknown,
  key: string | null,
  timeoutMs: number,
): Promise<CallOutcome<unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        reason: reasonForStatus(res.status),
        status: res.status,
        detail: safeDetail(detail, key),
      };
    }
    const json = await res.json();
    return { ok: true, value: json, status: res.status, detail: null };
  } catch (err) {
    return {
      ok: false,
      reason: reasonForThrown(err),
      status: null,
      detail: err instanceof Error ? safeDetail(err.message, key) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walks providers in priority order, running `attempt` against each until one
 * returns an answer. Records health for every attempt, successful or not.
 */
async function runWithFailover<T>(
  capability: AiCapability,
  attempt: (provider: AiProvider, key: string | null) => Promise<CallOutcome<T>>,
  modelOf: (provider: AiProvider) => string | null,
): Promise<AiResult<T>> {
  const providers = await listProvidersFor(capability);
  if (providers.length === 0) {
    return {
      ok: false,
      reason: "no_provider",
      messageFa: AI_FAILURE_FA.no_provider,
      attempts: [],
    };
  }

  const attempts: AiAttempt[] = [];

  for (const provider of providers) {
    const key = provider.has_key ? await getKey(provider.id) : null;
    const started = Date.now();
    const outcome = await attempt(provider, key);
    const ms = Date.now() - started;

    if (outcome.ok && outcome.value !== undefined) {
      await recordHealth(provider.id, capability, "ok", null, null, ms);
      return {
        ok: true,
        value: outcome.value,
        providerId: provider.id,
        providerName: provider.name,
        model: modelOf(provider) ?? "",
        ms,
      };
    }

    const reason = outcome.reason ?? "empty_response";
    attempts.push({
      providerId: provider.id,
      providerName: provider.name,
      reason,
      status: outcome.status,
      detail: outcome.detail,
    });
    await recordHealth(
      provider.id,
      capability,
      healthStatusFor(reason),
      outcome.status != null ? String(outcome.status) : reason,
      outcome.detail,
      ms,
    );

    if (!isFailoverReason(reason)) break;
  }

  const last = attempts[attempts.length - 1];
  const reason = last?.reason ?? "empty_response";
  return { ok: false, reason, messageFa: AI_FAILURE_FA[reason], attempts };
}

/* ------------------------------------------------------------------ */
/* chat                                                                */
/* ------------------------------------------------------------------ */

export async function aiChat(opts: AiChatOptions): Promise<AiResult<string>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return runWithFailover<string>(
    "chat",
    async (provider, key) => {
      const model = opts.model ?? provider.chat_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no chat model" };
      const base = provider.base_url.replace(/\/+$/, "");

      if (provider.kind === "ollama") {
        const r = await postJson(
          `${base}/api/chat`,
          {
            model,
            messages: opts.messages,
            stream: false,
            options: { temperature: opts.temperature ?? 0.2 },
          },
          key,
          timeoutMs,
        );
        if (!r.ok) return r as CallOutcome<string>;
        const text = (r.value as { message?: { content?: string } })?.message?.content ?? "";
        return text.trim()
          ? { ok: true, value: text, status: 200, detail: null }
          : { ok: false, reason: "empty_response", status: 200, detail: null };
      }

      const r = await postJson(
        `${base}/chat/completions`,
        { model, messages: opts.messages, temperature: opts.temperature ?? 0.2 },
        key,
        timeoutMs,
      );
      if (!r.ok) return r as CallOutcome<string>;
      const text =
        (r.value as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
          ?.content ?? "";
      return text.trim()
        ? { ok: true, value: text, status: 200, detail: null }
        : { ok: false, reason: "empty_response", status: 200, detail: null };
    },
    (p) => opts.model ?? p.chat_model,
  );
}

/* ------------------------------------------------------------------ */
/* embeddings                                                          */
/* ------------------------------------------------------------------ */

export async function aiEmbed(opts: AiEmbedOptions): Promise<AiResult<AiEmbedResult>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];

  return runWithFailover<AiEmbedResult>(
    "embeddings",
    async (provider, key) => {
      const model = opts.model ?? provider.embed_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no embed model" };
      const base = provider.base_url.replace(/\/+$/, "");

      let vectors: number[][] = [];
      if (provider.kind === "ollama") {
        const r = await postJson(`${base}/api/embed`, { model, input: inputs }, key, timeoutMs);
        if (!r.ok) return r as CallOutcome<AiEmbedResult>;
        vectors = (r.value as { embeddings?: number[][] })?.embeddings ?? [];
      } else {
        const r = await postJson(`${base}/embeddings`, { model, input: inputs }, key, timeoutMs);
        if (!r.ok) return r as CallOutcome<AiEmbedResult>;
        vectors = ((r.value as { data?: { embedding: number[] }[] })?.data ?? []).map(
          (d) => d.embedding,
        );
      }

      if (vectors.length === 0 || !Array.isArray(vectors[0]) || vectors[0].length === 0) {
        return { ok: false, reason: "empty_response", status: 200, detail: null };
      }
      // Dimension is MEASURED, never assumed. bge-m3 returns 1024 while
      // message_embeddings is vector(1536) for a different model; assuming
      // either number is how a silent mismatch gets written to the database.
      const dimension = vectors[0].length;
      if (opts.requiredDimension != null && dimension !== opts.requiredDimension) {
        // Not an answer to this question — keep walking to a provider whose
        // model matches the target column.
        return {
          ok: false,
          reason: "dimension_mismatch",
          status: 200,
          detail: `expected ${opts.requiredDimension}, got ${dimension}`,
        };
      }
      return {
        ok: true,
        value: { vectors, dimension },
        status: 200,
        detail: null,
      };
    },
    (p) => opts.model ?? p.embed_model,
  );
}

/* ------------------------------------------------------------------ */
/* vision                                                              */
/* ------------------------------------------------------------------ */

export async function aiVision(opts: AiVisionOptions): Promise<AiResult<string>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return runWithFailover<string>(
    "vision",
    async (provider, key) => {
      const model = opts.model ?? provider.vision_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no vision model" };
      const base = provider.base_url.replace(/\/+$/, "");

      if (provider.kind === "ollama") {
        const r = await postJson(
          `${base}/api/generate`,
          {
            model,
            prompt: opts.prompt,
            images: [opts.imageBase64],
            stream: false,
            think: false,
            options: { temperature: 0 },
          },
          key,
          timeoutMs,
        );
        if (!r.ok) return r as CallOutcome<string>;
        const text = (r.value as { response?: string })?.response ?? "";
        return text.trim()
          ? { ok: true, value: text, status: 200, detail: null }
          : { ok: false, reason: "empty_response", status: 200, detail: null };
      }

      const dataUrl = `data:${opts.mimeType};base64,${opts.imageBase64}`;
      const r = await postJson(
        `${base}/chat/completions`,
        {
          model,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: opts.prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        },
        key,
        timeoutMs,
      );
      if (!r.ok) return r as CallOutcome<string>;
      const text =
        (r.value as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
          ?.content ?? "";
      return text.trim()
        ? { ok: true, value: text, status: 200, detail: null }
        : { ok: false, reason: "empty_response", status: 200, detail: null };
    },
    (p) => opts.model ?? p.vision_model,
  );
}

/* ------------------------------------------------------------------ */
/* connection test + model discovery                                   */
/* ------------------------------------------------------------------ */

export interface DiscoveredModel {
  name: string;
  /** Reported by the provider. Empty when the provider cannot report it. */
  capabilities: AiCapability[];
  capabilitiesKnown: boolean;
}

/**
 * Ollama reports per-model capabilities through /api/tags + /api/show, so for
 * Ollama this is real discovery.
 *
 * For an OpenAI-compatible gateway there is no capability endpoint and no
 * pricing endpoint. Rather than fabricate either, this returns the model list
 * with `capabilitiesKnown: false` and leaves the choice to the admin, backed
 * by the curated preference list in `model-preferences.ts`.
 */
export async function discoverModels(
  providerId: string,
): Promise<{ ok: true; models: DiscoveredModel[] } | { ok: false; messageFa: string }> {
  const { data, error } = await supabaseAdmin
    .from("ai_providers" as never)
    .select("id,kind,base_url,secret_id")
    .eq("id", providerId)
    .maybeSingle();

  if (error || !data) return { ok: false, messageFa: AI_FAILURE_FA.no_provider };
  const row = data as unknown as { kind: string; base_url: string; secret_id: string | null };
  const base = row.base_url.replace(/\/+$/, "");
  const key = row.secret_id ? await getKey(providerId) : null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    if (row.kind === "ollama") {
      const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, messageFa: AI_FAILURE_FA[reasonForStatus(res.status)] };
      const json = (await res.json()) as { models?: { name: string }[] };
      const names = (json.models ?? []).map((m) => m.name);

      const models: DiscoveredModel[] = [];
      for (const name of names) {
        let caps: AiCapability[] = [];
        try {
          const showRes = await fetch(`${base}/api/show`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: name }),
            signal: ctrl.signal,
          });
          if (showRes.ok) {
            const show = (await showRes.json()) as { capabilities?: string[] };
            const reported = show.capabilities ?? [];
            if (reported.includes("embedding")) caps.push("embeddings");
            if (reported.includes("completion")) caps.push("chat");
            if (reported.includes("vision")) caps.push("vision");
          }
        } catch {
          caps = [];
        }
        models.push({ name, capabilities: caps, capabilitiesKnown: caps.length > 0 });
      }
      return { ok: true, models };
    }

    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${base}/models`, { headers, signal: ctrl.signal });
    if (!res.ok) return { ok: false, messageFa: AI_FAILURE_FA[reasonForStatus(res.status)] };
    const json = (await res.json()) as { data?: { id: string }[] };
    return {
      ok: true,
      models: (json.data ?? []).map((m) => ({
        name: m.id,
        capabilities: [],
        capabilitiesKnown: false,
      })),
    };
  } catch (err) {
    return { ok: false, messageFa: AI_FAILURE_FA[reasonForThrown(err)] };
  } finally {
    clearTimeout(timer);
  }
}

/** Cheapest real call that proves the provider answers for this capability. */
export async function testProviderCapability(
  providerId: string,
  capability: AiCapability,
): Promise<{ ok: boolean; messageFa: string; ms: number | null; detail: string | null }> {
  const providers = await listProvidersFor(capability);
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return {
      ok: false,
      messageFa: "این ارائه‌دهنده این قابلیت را پشتیبانی نمی‌کند یا غیرفعال است.",
      ms: null,
      detail: null,
    };
  }

  // The *For helpers below deliberately do not fail over, so the test reports
  // on the provider the admin clicked rather than on whichever one answered.
  const started = Date.now();
  let result: AiResult<unknown>;
  if (capability === "embeddings") {
    result = await aiEmbedFor(provider, "تست اتصال");
  } else if (capability === "vision") {
    result = await aiVisionFor(
      provider,
      "Describe this image in one short sentence.",
      TINY_PNG,
      "image/png",
    );
  } else {
    result = await aiChatFor(provider, [{ role: "user", content: "فقط بنویس: سلام" }]);
  }
  const ms = Date.now() - started;

  if (result.ok) {
    await recordHealth(provider.id, capability, "ok", null, null, ms);
    return { ok: true, messageFa: "اتصال برقرار است.", ms, detail: null };
  }
  await recordHealth(
    provider.id,
    capability,
    healthStatusFor(result.reason),
    result.reason,
    result.attempts[0]?.detail ?? null,
    ms,
  );
  return {
    ok: false,
    messageFa: result.messageFa,
    ms,
    detail: result.attempts[0]?.detail ?? null,
  };
}

/** 1x1 transparent PNG — enough to prove a vision endpoint responds. */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* Single-provider variants used by the connection test. They deliberately do
 * NOT fail over: a test must report on the provider that was clicked. */

async function singleProvider<T>(
  provider: AiProvider,
  attempt: (provider: AiProvider, key: string | null) => Promise<CallOutcome<T>>,
  model: string | null,
): Promise<AiResult<T>> {
  const key = provider.has_key ? await getKey(provider.id) : null;
  const started = Date.now();
  const outcome = await attempt(provider, key);
  const ms = Date.now() - started;
  if (outcome.ok && outcome.value !== undefined) {
    return {
      ok: true,
      value: outcome.value,
      providerId: provider.id,
      providerName: provider.name,
      model: model ?? "",
      ms,
    };
  }
  const reason = outcome.reason ?? "empty_response";
  return {
    ok: false,
    reason,
    messageFa: AI_FAILURE_FA[reason],
    attempts: [
      {
        providerId: provider.id,
        providerName: provider.name,
        reason,
        status: outcome.status,
        detail: outcome.detail,
      },
    ],
  };
}

async function aiChatFor(
  provider: AiProvider,
  messages: AiChatOptions["messages"],
): Promise<AiResult<string>> {
  return singleProvider<string>(
    provider,
    async (p, key) => {
      const model = p.chat_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no chat model" };
      const base = p.base_url.replace(/\/+$/, "");
      if (p.kind === "ollama") {
        const r = await postJson(
          `${base}/api/chat`,
          { model, messages, stream: false },
          key,
          60_000,
        );
        if (!r.ok) return r as CallOutcome<string>;
        const t = (r.value as { message?: { content?: string } })?.message?.content ?? "";
        return t.trim()
          ? { ok: true, value: t, status: 200, detail: null }
          : { ok: false, reason: "empty_response", status: 200, detail: null };
      }
      const r = await postJson(`${base}/chat/completions`, { model, messages }, key, 60_000);
      if (!r.ok) return r as CallOutcome<string>;
      const t =
        (r.value as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
          ?.content ?? "";
      return t.trim()
        ? { ok: true, value: t, status: 200, detail: null }
        : { ok: false, reason: "empty_response", status: 200, detail: null };
    },
    provider.chat_model,
  );
}

async function aiEmbedFor(provider: AiProvider, text: string): Promise<AiResult<AiEmbedResult>> {
  return singleProvider<AiEmbedResult>(
    provider,
    async (p, key) => {
      const model = p.embed_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no embed model" };
      const base = p.base_url.replace(/\/+$/, "");
      let vectors: number[][] = [];
      if (p.kind === "ollama") {
        const r = await postJson(`${base}/api/embed`, { model, input: [text] }, key, 60_000);
        if (!r.ok) return r as CallOutcome<AiEmbedResult>;
        vectors = (r.value as { embeddings?: number[][] })?.embeddings ?? [];
      } else {
        const r = await postJson(`${base}/embeddings`, { model, input: [text] }, key, 60_000);
        if (!r.ok) return r as CallOutcome<AiEmbedResult>;
        vectors = ((r.value as { data?: { embedding: number[] }[] })?.data ?? []).map(
          (d) => d.embedding,
        );
      }
      if (vectors.length === 0 || !vectors[0]?.length)
        return { ok: false, reason: "empty_response", status: 200, detail: null };
      return {
        ok: true,
        value: { vectors, dimension: vectors[0].length },
        status: 200,
        detail: null,
      };
    },
    provider.embed_model,
  );
}

async function aiVisionFor(
  provider: AiProvider,
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<AiResult<string>> {
  return singleProvider<string>(
    provider,
    async (p, key) => {
      const model = p.vision_model;
      if (!model)
        return { ok: false, reason: "no_provider", status: null, detail: "no vision model" };
      const base = p.base_url.replace(/\/+$/, "");
      if (p.kind === "ollama") {
        const r = await postJson(
          `${base}/api/generate`,
          { model, prompt, images: [imageBase64], stream: false, think: false },
          key,
          120_000,
        );
        if (!r.ok) return r as CallOutcome<string>;
        const t = (r.value as { response?: string })?.response ?? "";
        return t.trim()
          ? { ok: true, value: t, status: 200, detail: null }
          : { ok: false, reason: "empty_response", status: 200, detail: null };
      }
      const r = await postJson(
        `${base}/chat/completions`,
        {
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                },
              ],
            },
          ],
        },
        key,
        120_000,
      );
      if (!r.ok) return r as CallOutcome<string>;
      const t =
        (r.value as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
          ?.content ?? "";
      return t.trim()
        ? { ok: true, value: t, status: 200, detail: null }
        : { ok: false, reason: "empty_response", status: 200, detail: null };
    },
    provider.vision_model,
  );
}
