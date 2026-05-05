import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ensureAuthReady } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/AuthProvider";
import { logAuthDiagnostic, getAuthDiagnostics, clearAuthDiagnostics } from "@/lib/auth/diagnostics";
import { useState } from "react";

export function AuthLoadingScreen() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center text-sm text-muted-foreground">در حال بررسی جلسه کاربری...</div>
    </div>
  );
}

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // Skip the auth check during SSR — Supabase env vars may not be
    // available in the Worker. The client-side AuthProvider/loading
    // screen handles the redirect after hydration.
    if (typeof window === "undefined") return;
    try {
      const auth = await ensureAuthReady();
      if (!auth.user) {
        throw redirect({ to: "/login" });
      }
      const status = auth.profile?.status;
      if (status && status !== "active") {
        throw redirect({ to: "/pending-approval" });
      }
      if (auth.authError) {
        logAuthDiagnostic("_app.beforeLoad.authError", auth.authError, {
          profileError: auth.profileError,
          rolesError: auth.rolesError,
        });
      }
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      console.error("[_app] beforeLoad auth check failed", err);
      logAuthDiagnostic("_app.beforeLoad", "auth check failed", err);
    }
  },
  pendingMs: 0,
  pendingComponent: AuthLoadingScreen,
  component: AppLayout,
});

function AppLayout() {
  const { loading, profileLoading, rolesLoading, authError, retryAuth } = useAuth();
  const [showDiag, setShowDiag] = useState(false);

  if (loading || profileLoading || rolesLoading) {
    return <AuthLoadingScreen />;
  }

  if (authError) {
    const diag = getAuthDiagnostics();
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-2xl space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">خطا در بارگذاری جلسه کاربری</h1>
          <p className="text-sm text-muted-foreground">{authError}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => void retryAuth()}>تلاش دوباره</Button>
            <Button variant="outline" onClick={() => setShowDiag((v) => !v)}>
              {showDiag ? "بستن گزارش خطا" : "نمایش گزارش خطا"}
            </Button>
            {diag.length > 0 && (
              <Button variant="ghost" onClick={() => { clearAuthDiagnostics(); setShowDiag(false); }}>
                پاک‌کردن لاگ
              </Button>
            )}
          </div>
          {showDiag && (
            <pre dir="ltr" className="max-h-80 overflow-auto rounded border border-border bg-muted p-3 text-left text-xs text-foreground">
{JSON.stringify(diag, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}