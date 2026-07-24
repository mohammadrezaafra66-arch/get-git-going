/**
 * Shared AI client — public types.
 *
 * Chat, embeddings and vision are DISTINCT capabilities on purpose. Not every
 * provider or model serves all three, and conflating them is exactly how a
 * vision request ends up at a text-only model and comes back as confident
 * nonsense.
 */

export const AI_CAPABILITIES = ["chat", "embeddings", "vision"] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const AI_CAPABILITY_FA: Record<AiCapability, string> = {
  chat: "گفت‌وگو",
  embeddings: "بردار معنایی",
  vision: "خواندن تصویر",
};

export type AiProviderKind = "ollama" | "openai_compatible";

export interface AiProvider {
  id: string;
  name: string;
  label: string;
  kind: AiProviderKind;
  base_url: string;
  is_active: boolean;
  priority: number;
  chat_model: string | null;
  embed_model: string | null;
  vision_model: string | null;
  capabilities: AiCapability[];
  /** Display only. The key itself never reaches the client. */
  key_prefix: string | null;
  has_key: boolean;
  notes: string | null;
}

/**
 * Why a single provider attempt did not produce an answer.
 *
 * The distinction that matters operationally is `rate_limited` vs
 * `credit_exhausted`: the first means try again shortly, the second means
 * somebody has to top the account up. Collapsing them into "error" would send
 * an admin hunting for a fault that is really an invoice.
 */
export type AiFailureReason =
  | "no_provider" // nothing configured for this capability
  | "unreachable" // connection refused / DNS / network
  | "timeout"
  | "server_error" // 5xx
  | "rate_limited" // 429
  | "credit_exhausted" // 402
  | "unauthorized" // 401 / 403 — a key problem, not a load problem
  | "bad_request" // 4xx we caused
  | "empty_response";

export const AI_FAILURE_FA: Record<AiFailureReason, string> = {
  no_provider: "هیچ ارائه‌دهنده هوش مصنوعی برای این قابلیت تنظیم نشده است.",
  unreachable: "ارتباط با سرویس هوش مصنوعی برقرار نشد.",
  timeout: "سرویس هوش مصنوعی در زمان مقرر پاسخ نداد.",
  server_error: "سرویس هوش مصنوعی با خطای داخلی مواجه شد.",
  rate_limited: "سرویس هوش مصنوعی موقتاً شلوغ است؛ چند لحظه بعد دوباره تلاش کنید.",
  credit_exhausted: "اعتبار حساب سرویس هوش مصنوعی تمام شده است؛ باید شارژ شود.",
  unauthorized: "کلید سرویس هوش مصنوعی معتبر نیست.",
  bad_request: "درخواست ارسال‌شده به سرویس هوش مصنوعی معتبر نبود.",
  empty_response: "سرویس هوش مصنوعی پاسخی برنگرداند.",
};

/**
 * A failure that produced NO answer is safe to retry on the next provider: no
 * double spend, and no risk of two different answers to one question. A
 * successful call is never retried elsewhere, however poor the answer looks —
 * "the answer seemed weak" is not an availability signal.
 *
 * `unauthorized` and `bad_request` are included because they are equally
 * answer-less for this provider; the failure is still recorded against it, so
 * a broken key stays visible on the admin page instead of being masked.
 */
export function isFailoverReason(reason: AiFailureReason): boolean {
  return reason !== "no_provider";
}

export interface AiAttempt {
  providerId: string;
  providerName: string;
  reason: AiFailureReason;
  status: number | null;
  detail: string | null;
}

export type AiResult<T> =
  | { ok: true; value: T; providerId: string; providerName: string; model: string; ms: number }
  | { ok: false; reason: AiFailureReason; messageFa: string; attempts: AiAttempt[] };

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatOptions {
  messages: AiChatMessage[];
  temperature?: number;
  timeoutMs?: number;
  /** Override the provider's configured chat model. */
  model?: string;
}

export interface AiEmbedOptions {
  input: string | string[];
  timeoutMs?: number;
  model?: string;
}

export interface AiEmbedResult {
  vectors: number[][];
  /** Measured from the response, never assumed. bge-m3 is 1024, not 1536. */
  dimension: number;
}

export interface AiVisionOptions {
  prompt: string;
  /** Raw image bytes, base64 encoded (no data: prefix). */
  imageBase64: string;
  mimeType: string;
  timeoutMs?: number;
  model?: string;
}

export interface AiProviderHealth {
  provider_id: string;
  capability: AiCapability;
  last_status: "ok" | "error" | "rate_limited" | "credit_exhausted" | "unavailable";
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_latency_ms: number | null;
  updated_at: string;
}

/** Maps a failure reason onto the health vocabulary stored in the database. */
export function healthStatusFor(reason: AiFailureReason): AiProviderHealth["last_status"] {
  switch (reason) {
    case "rate_limited":
      return "rate_limited";
    case "credit_exhausted":
      return "credit_exhausted";
    case "unreachable":
    case "timeout":
    case "server_error":
      return "unavailable";
    default:
      return "error";
  }
}
