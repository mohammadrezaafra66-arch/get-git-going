import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ensureAuthReady } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pending-approval")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const auth = await ensureAuthReady();
      if (!auth.user) throw redirect({ to: "/login" });
      const status = auth.profile?.status;
      if (status === "active") throw redirect({ to: "/dashboard" });
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      console.error("[pending-approval] beforeLoad auth check failed", err);
    }
  },
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const navigate = useNavigate();
  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle>در انتظار تأیید مدیر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>حساب شما با موفقیت ساخته شده ولی هنوز توسط مدیر تأیید نشده است. پس از تأیید می‌توانید وارد سامانه شوید.</p>
          <Button variant="outline" onClick={onLogout} className="w-full">خروج</Button>
        </CardContent>
      </Card>
    </div>
  );
}