import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAllRoles } from "@/lib/rbac/roles";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { toast } from "sonner";
import { OnlineDot } from "@/components/presence/OnlineDot";

export const Route = createFileRoute("/_app/roles")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: RolesPage,
});

interface UserWithRoles {
  id: string;
  full_name: string | null;
  roles: string[];
}

function RolesPage() {
  const qc = useQueryClient();
  const { data: allRoles, isLoading: rolesLoading } = useAllRoles();

  const { data, isLoading } = useQuery({
    queryKey: ["roles-matrix"],
    queryFn: async (): Promise<UserWithRoles[]> => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const map = new Map<string, string[]>();
      for (const r of roles ?? []) {
        const arr = map.get(r.user_id) ?? [];
        arr.push(r.role as string);
        map.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p) => ({ ...p, roles: map.get(p.id) ?? [] }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({
      userId,
      role,
      enabled,
    }: {
      userId: string;
      role: string;
      enabled: boolean;
    }) => {
      if (enabled) {
        const { error } = await supabase.rpc("assign_user_role_txt", {
          _target_user: userId,
          _role: role,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("revoke_user_role_txt", {
          _target_user: userId,
          _role: role,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles-matrix"] });
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast.success("نقش به‌روز شد");
    },
    onError: (e: Error) => toast.error("خطا در به‌روزرسانی نقش", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="نقش‌ها و دسترسی"
        description="تخصیص نقش به کاربران. تغییرات در audit log ثبت می‌شود."
      />
      <Card>
        <CardContent className="p-0">
          {isLoading || rolesLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              کاربری برای مدیریت نقش وجود ندارد.{" "}
              <Link to="/users" className="text-primary">
                مشاهده کاربران
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">کاربر</th>
                    {allRoles.map((r) => (
                      <th key={r.name} className="p-3 text-center font-medium">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="relative inline-block h-2.5 w-2.5">
                            <OnlineDot userId={u.id} />
                          </span>
                          {u.full_name ?? "—"}
                        </span>
                      </td>
                      {allRoles.map((r) => {
                        const checked = u.roles.includes(r.name);
                        return (
                          <td key={r.name} className="p-3 text-center">
                            <Checkbox
                              checked={checked}
                              disabled={toggle.isPending}
                              onCheckedChange={(v) =>
                                toggle.mutate({ userId: u.id, role: r.name, enabled: Boolean(v) })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
