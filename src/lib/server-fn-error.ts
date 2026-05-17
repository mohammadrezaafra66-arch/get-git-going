/**
 * Server functions guarded by `requireSupabaseAuth` may throw a raw `Response`
 * (e.g. 401/500) instead of an `Error`. React Query stores whatever is thrown,
 * and a raw Response surfaces in window.onerror as the literal string
 * "[object Response]" — which blanks the page. Wrap every server function call
 * with `toError()` so the rejection is always a proper `Error` with a Persian
 * message that UIs can render normally.
 *
 * In addition, TanStack Start's server-fn client SDK sometimes RESOLVES a
 * failed RPC with the JSON body of the error response instead of rejecting,
 * e.g. `{ status: 500, unhandled: true, message: "HTTPError" }`. That looks
 * like a successful result to caller code (`person?.id` is undefined) and the
 * UI surfaces a confusing "پاسخ سرور بدون شناسه بود" toast even though the
 * server actually failed. `toError` also normalises that envelope into a
 * proper Persian Error so `onError` handles it like any other failure.
 */

type UnhandledEnvelope = {
  status?: number;
  unhandled?: boolean;
  message?: string;
};

function isUnhandledEnvelope(v: unknown): v is UnhandledEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.unhandled === true ||
    (typeof o.status === "number" && o.status >= 400 && typeof o.message === "string")
  );
}

function envelopeToError(env: UnhandledEnvelope): Error {
  const status = env.status ?? 0;
  if (status === 401) return new Error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
  if (status === 403) return new Error("دسترسی لازم برای این عملیات را ندارید.");
  if (status >= 500) return new Error("خطای داخلی سرور هنگام پردازش درخواست. لطفاً دوباره تلاش کنید.");
  return new Error(env.message || `خطای سرور (${status || "نامشخص"})`);
}

export async function toError<T>(p: Promise<T>): Promise<T> {
  try {
    const result = await p;
    if (isUnhandledEnvelope(result)) {
      throw envelopeToError(result as UnhandledEnvelope);
    }
    return result;
  } catch (e) {
    if (e instanceof Error) throw e;
    if (typeof Response !== "undefined" && e instanceof Response) {
      let detail = "";
      try {
        detail = await e.clone().text();
      } catch {
        /* ignore */
      }
      if (e.status === 401) {
        throw new Error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
      }
      throw new Error(detail || `خطای سرور (${e.status})`);
    }
    if (isUnhandledEnvelope(e)) {
      throw envelopeToError(e as UnhandledEnvelope);
    }
    throw new Error("خطای ناشناخته در ارتباط با سرور");
  }
}
