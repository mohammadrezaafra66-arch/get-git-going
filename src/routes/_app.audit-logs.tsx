import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/audit-logs")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: AuditLogsPage,
});

interface LogRow {
  id: number;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  diff: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  role_assigned: "تخصیص نقش",
  role_revoked: "حذف نقش",
  role_updated: "تغییر نقش",
  login_success: "ورود موفق",
  logout: "خروج",
};

function ActorCell({ actorId, names }: { actorId: string | null; names: Map<string, string> }) {
  if (!actorId) return <span className="text-muted-foreground">سیستم</span>;
  return <span>{names.get(actorId) ?? actorId.slice(0, 8)}</span>;
}

function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, entity_type, entity_id, action, diff, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = Array.from(
        new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean) as string[]),
      );
      const namesMap = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) namesMap.set(p.id, p.full_name ?? p.id.slice(0, 8));
      }
      return { logs: (logs ?? []) as LogRow[], names: namesMap };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش حسابرسی"
        description="تاریخچه عملیات حساس: تغییر نقش‌ها، ورود و خروج کاربران."
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : !data || data.logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ScrollText className="h-8 w-8 opacity-50" />
              هنوز رخدادی ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">زمان</th>
                    <th className="p-3 font-medium">کاربر فاعل</th>
                    <th className="p-3 font-medium">عملیات</th>
                    <th className="p-3 font-medium">موجودیت</th>
                    <th className="p-3 font-medium">شناسه هدف</th>
                    <th className="p-3 font-medium">جزئیات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateFa(l.created_at)}
                      </td>
                      <td className="p-3">
                        <ActorCell actorId={l.actor_id} names={data.names} />
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary">{ACTION_LABELS[l.action] ?? l.action}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{l.entity_type}</td>
                      <td className="p-3 text-xs text-muted-foreground" dir="ltr">
                        {l.entity_id.slice(0, 8)}…
                      </td>
                      <td className="p-3 text-xs">
                        {l.diff ? (
                          <code
                            dir="ltr"
                            className="block max-w-xs truncate rounded bg-muted px-2 py-1"
                          >
                            {JSON.stringify(l.diff)}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
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
