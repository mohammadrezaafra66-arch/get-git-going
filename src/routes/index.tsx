import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ensureAuthReady } from "@/lib/auth/session";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Skip during SSR — auth lives in the browser session.
    if (typeof window === "undefined") return;
    try {
      let auth = await ensureAuthReady();
      if (!auth.user && (auth.loading || !auth.initialized)) {
        auth = await ensureAuthReady(true);
      }
      if (!auth.user) {
        logAuthDiagnostic("redirect.login", "index.beforeLoad: no user", {
          loading: auth.loading,
          initialized: auth.initialized,
        });
      }
      throw redirect({ to: auth.user ? "/dashboard" : "/login" });
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      console.error("[index] auth check failed", err);
      logAuthDiagnostic("redirect.login", "index.beforeLoad: error fallback", err);
      throw redirect({ to: "/login" });
    }
  },
  component: IndexRedirect,
});

function IndexRedirect() {
  // Client-side safety net: if beforeLoad somehow didn't redirect (e.g. during
  // hydration), push to /login so the user is never stuck on a blank loader.
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await ensureAuthReady();
        if (cancelled) return;
        navigate({ to: auth.user ? "/dashboard" : "/login", replace: true });
      } catch {
        if (!cancelled) navigate({ to: "/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"
    >
      <span className="text-sm">در حال بارگذاری…</span>
    </div>
  );
}
