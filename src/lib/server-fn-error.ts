/**
 * Server functions guarded by `requireSupabaseAuth` may throw a raw `Response`
 * (e.g. 401/500) instead of an `Error`. React Query stores whatever is thrown,
 * and a raw Response surfaces in window.onerror as the literal string
 * "[object Response]" — which blanks the page. Wrap every server function call
 * with `toError()` so the rejection is always a proper `Error` with a Persian
 * message that UIs can render normally.
 */
export async function toError<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
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
    throw new Error("خطای ناشناخته در ارتباط با سرور");
  }
}