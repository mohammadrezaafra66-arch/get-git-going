import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { ROLE_LABELS, type AppRole } from "@/lib/rbac/roles";
import { formatDateFa } from "@/lib/i18n/formatters";
import { DynamicScoringSection } from "@/components/credit/DynamicScoringSection";
import { EmployeeProfileCard } from "@/components/users/EmployeeProfileCard";

export const Route = createFileRoute("/_app/users/$userId")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: UserDetailPage,
});

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  position: string | null;
  status: string;
  registered_at: string;
}

function UserDetailPage() {
  const { userId } = Route.useParams();

  const profileQ = useQuery({
    queryKey: ["user-detail-profile", userId],
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, position, status, registered_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProfileRow | null;
    },
  });

  const rolesQ = useQuery({
    queryKey: ["user-detail-roles", userId],
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    },
  });

  const roles = rolesQ.data ?? [];
  const isSales = roles.includes("sales");

  return (
    <div className="space-y-6">
      <PageHeader
        title={profileQ.data?.full_name ?? "پروفایل کاربر"}
        description="مشاهدهٔ اطلاعات کاربر و امتیازدهی پویای ماهانه"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/users">
              <ArrowRight className="ml-1 h-4 w-4" />
              بازگشت به لیست
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          {profileQ.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : !profileQ.data ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              کاربر یافت نشد.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">نام کامل</div>
                <div className="font-medium">{profileQ.data.full_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">تلفن</div>
                <div className="font-medium" dir="ltr">
                  {profileQ.data.phone ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">سمت سازمانی</div>
                <div className="font-medium">{profileQ.data.position ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">تاریخ ثبت‌نام</div>
                <div className="font-medium">{formatDateFa(profileQ.data.registered_at)}</div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="text-xs text-muted-foreground mb-1">نقش‌ها</div>
                <div className="flex flex-wrap gap-1.5">
                  {roles.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {ROLE_LABELS[r] ?? r}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!rolesQ.isLoading && !isSales && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            این کاربر نقش «کارشناس فروش» ندارد. ثبت امتیاز پویا برای او همچنان ممکن است،
            ولی در تخصیص روزانهٔ سرمایه شرکت نخواهد کرد.
          </AlertDescription>
        </Alert>
      )}

      <EmployeeProfileCard userId={userId} />

      <DynamicScoringSection entityType="salesperson" entityId={userId} canEdit={true} />
    </div>
  );
}