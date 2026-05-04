import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ensureAuthReady } from "@/lib/auth/session";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
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
