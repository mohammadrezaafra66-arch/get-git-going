import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldAlert } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/lib/rbac/roles";
import { formatDateFa } from "@/lib/i18n/formatters";
import { requireAdmin } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/users")({
  beforeLoad: async () => { await requireAdmin(); },
  component: UsersPage,
});

interface UserRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  roles: AppRole[];
}

function UsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async (): Promise<UserRow[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
      const map = new Map<string, AppRole[]>();
      for (const r of rolesData ?? []) {
        const arr = map.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        map.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p) => ({ ...p, roles: map.get(p.id) ?? [] }));
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="کاربران" description="فهرست همه کاربران سامانه و نقش‌های تخصیص‌داده‌شده." />

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Users} title="هنوز کاربری ثبت نشده" description="پس از ثبت‌نام اولین کاربر، در اینجا نمایش داده می‌شود." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">نام</th>
                    <th className="p-3 font-medium">تلفن</th>
                    <th className="p-3 font-medium">نقش‌ها</th>
                    <th className="p-3 font-medium">وضعیت</th>
                    <th className="p-3 font-medium">تاریخ عضویت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{u.phone ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <Badge variant="outline" className="gap-1"><ShieldAlert className="h-3 w-3" />بدون نقش</Badge>
                          ) : u.roles.map((r) => (
                            <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={u.is_active ? "default" : "outline"}>
                          {u.is_active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateFa(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}