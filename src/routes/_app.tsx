import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ensureAuthReady } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const auth = await ensureAuthReady();
    if (!auth.user) {
      throw redirect({ to: "/login" });
    }
  },
  pendingMs: 0,
  pendingComponent: AuthLoadingScreen,
  component: AppLayout,
});

function AppLayout() {
  const { loading, profileLoading, rolesLoading, authError, retryAuth } = useAuth();

  if (loading || profileLoading || rolesLoading) {
    return <AuthLoadingScreen />;
  }

  if (authError) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">خطا در بارگذاری جلسه کاربری</h1>
          <p className="text-sm text-muted-foreground">{authError}</p>
          <div className="flex justify-center">
            <Button onClick={() => void retryAuth()}>تلاش دوباره</Button>
          </div>
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

function AuthLoadingScreen() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center text-sm text-muted-foreground">در حال بررسی جلسه کاربری...</div>
    </div>
  );
}