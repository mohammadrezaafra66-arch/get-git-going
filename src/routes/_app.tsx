import { createFileRoute, isRedirect, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ensureAuthReady } from "@/lib/auth/session";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import {
  logAuthDiagnostic,
  getAuthDiagnostics,
  clearAuthDiagnostics,
  sanitizeDiagnosticsForClipboard,
} from "@/lib/auth/diagnostics";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
      let auth = await ensureAuthReady();
      // Defensive re-check: if user is missing but we're still mid-load
      // (e.g. SIGNED_IN handler hasn't finished applySession yet), force a
      // fresh resolve before deciding to redirect. Prevents bouncing the
      // user back to /login right after a successful sign-in.
      if (!auth.user && (auth.loading || !auth.initialized) && !auth.authError) {
        auth = await ensureAuthReady(true);
      }
      if (!auth.user && auth.authError) {
        logAuthDiagnostic(
          "_app.beforeLoad.authTransient",
          "auth unavailable; showing retry screen",
          {
            initialized: auth.initialized,
            loading: auth.loading,
            authError: auth.authError,
          },
        );
        return;
      }
      if (!auth.user) {
        logAuthDiagnostic("redirect.login", "_app.beforeLoad: no user", {
          initialized: auth.initialized,
          loading: auth.loading,
          authError: auth.authError,
        });
        throw redirect({ to: "/login" });
      }
      if (auth.user && !auth.profile && auth.authError) {
        logAuthDiagnostic(
          "_app.beforeLoad.profileMissing",
          "user exists but profile is unavailable",
          {
            authError: auth.authError,
            profileError: auth.profileError,
            rolesError: auth.rolesError,
          },
        );
      }
      const status = auth.profile?.status;
      if (auth.profile && status && status !== "active") {
        logAuthDiagnostic("redirect.pending", "_app.beforeLoad: status not active", { status });
        throw redirect({ to: "/pending-approval" });
      }
      if (auth.authError) {
        logAuthDiagnostic("_app.beforeLoad.authError", auth.authError, {
          profileError: auth.profileError,
          rolesError: auth.rolesError,
        });
      }
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error("[_app] beforeLoad auth check failed", err);
      logAuthDiagnostic("_app.beforeLoad", "auth check failed", err);
    }
  },
  pendingMs: 300,
  pendingComponent: AuthLoadingScreen,
  component: AppLayout,
});

function AppLayout() {
  return (
    <AuthProvider>
      <AppLayoutContent />
    </AuthProvider>
  );
}

function AppLayoutContent() {
  const {
    user,
    initialized,
    loading,
    profileLoading,
    rolesLoading,
    authError,
    profileError,
    rolesError,
    retryAuth,
  } = useAuth();
  const [showDiag, setShowDiag] = useState(false);
  const [stuckLoading, setStuckLoading] = useState(false);

  const isRefreshing = loading || profileLoading || rolesLoading;

  useEffect(() => {
    if (!isRefreshing) {
      setStuckLoading(false);
      return;
    }
    const id = window.setTimeout(() => setStuckLoading(true), 6_000);
    return () => window.clearTimeout(id);
  }, [isRefreshing]);

  const copyDiagnostics = async () => {
    const diag = getAuthDiagnostics();
    try {
      await navigator.clipboard.writeText(sanitizeDiagnosticsForClipboard(diag));
      toast.success("گزارش خطا کپی شد");
    } catch (error) {
      console.error("[auth] copy diagnostics failed", error);
      toast.error("کپی گزارش خطا ناموفق بود");
    }
  };

  // Only block the entire app with the full-screen loading state when we truly
  // have no user yet (initial bootstrap). For subsequent refreshes (HMR
  // re-mount, token refresh, re-fetch of profile/roles) the cached user is
  // already in the snapshot, so we keep the page mounted and show a thin
  // top progress bar instead — otherwise the user perceives every module
  // switch as being kicked out to «در حال بررسی جلسه کاربری…».
  if (!user && (isRefreshing || !initialized)) {
    if (stuckLoading) {
      return (
        <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-lg font-semibold text-foreground">بررسی جلسه کاربری طولانی شد</h1>
            <p className="text-sm text-muted-foreground">
              ارتباط با اطلاعات کاربری کامل نشده است. اگر اینترنت ناپایدار است، دوباره تلاش کنید.
            </p>
            <Button onClick={() => void retryAuth()}>تلاش دوباره</Button>
          </div>
        </div>
      );
    }
    return <AuthLoadingScreen />;
  }

  if (!user && authError) {
    const diag = getAuthDiagnostics();
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-2xl space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">خطا در بارگذاری جلسه کاربری</h1>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{authError}</p>
            {profileError && <p>خطای پروفایل: {profileError}</p>}
            {rolesError && <p>خطای نقش‌ها: {rolesError}</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void retryAuth()}>تلاش دوباره</Button>
            <Button variant="outline" onClick={() => setShowDiag((v) => !v)}>
              {showDiag ? "بستن گزارش خطا" : "نمایش گزارش خطا"}
            </Button>
            <Button variant="outline" onClick={() => void copyDiagnostics()}>
              کپی گزارش خطا
            </Button>
            {diag.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  clearAuthDiagnostics();
                  setShowDiag(false);
                }}
              >
                پاک‌کردن لاگ
              </Button>
            )}
          </div>
          {showDiag && (
            <pre
              dir="ltr"
              className="max-h-80 overflow-auto rounded border border-border bg-muted p-3 text-left text-xs text-foreground"
            >
              {sanitizeDiagnosticsForClipboard(diag)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      {user && isRefreshing && (
        <div
          dir="rtl"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-primary/15"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary/60" />
        </div>
      )}
      <Outlet />
    </AppShell>
  );
}
