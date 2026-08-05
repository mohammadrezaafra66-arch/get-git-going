import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRANDING } from "@/config/branding";

// The @supabase/supabase-js `oauth` namespace is currently in beta and not
// present in the generated types; wrap the three methods we need in a small
// local typed helper so we do not need to touch the generated client file.
type AuthorizationDetails = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string | null } | null;
};
type OAuthResult = {
  data: { redirect_url?: string; redirect_to?: string } | null;
  error: { message: string } | null;
};
function oauthApi() {
  const anyAuth = (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (
        id: string,
      ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  }).oauth;
  return anyAuth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent on the SSR pass. Without this, getSession() is null on
  // the server and signed-in users get bounced to login.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main dir="rtl" className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>خطا در بارگذاری درخواست</CardTitle>
          <CardDescription>
            امکان بارگذاری این درخواست دسترسی وجود نداشت.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {String((error as Error)?.message ?? error)}
          </p>
        </CardContent>
      </Card>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData() as AuthorizationDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "برنامه بیرونی";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("سرور مجوز آدرس بازگشتی برنگرداند.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>اتصال {clientName} به حساب شما</CardTitle>
          <CardDescription>
            {clientName} می‌خواهد به‌عنوان شما به {BRANDING.platformName} دسترسی داشته باشد و
            از ابزارهای این حساب استفاده کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void decide(false)}
            >
              رد کردن
            </Button>
            <Button type="button" disabled={busy} onClick={() => void decide(true)}>
              {busy ? "در حال پردازش..." : "تأیید و اتصال"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}