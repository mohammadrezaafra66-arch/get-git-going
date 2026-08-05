import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { summarizePersonAuditAction } from "@/lib/persons/profile-audit";

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  diff: unknown;
  created_at: string;
};

export function PersonAuditSummary({
  personId,
  canView,
}: {
  personId: string;
  canView: boolean;
}) {
  const query = useQuery({
    queryKey: ["person", personId, "audit-summary"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, actor_id, diff, created_at")
        .or(`entity_id.eq.${personId},diff->>person_id.eq.${personId}`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AuditRow[];

      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const actorNames = new Map<string, string>();
      if (actorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        for (const p of profiles ?? []) {
          actorNames.set(p.id, p.full_name?.trim() || "کاربر");
        }
      }

      // Deduplicate by id (or should not happen from query).
      const seen = new Set<number>();
      const unique = rows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      return unique.map((r) => ({
        id: String(r.id),
        label: summarizePersonAuditAction(r.action, r.entity_type, r.diff),
        actor: r.actor_id ? (actorNames.get(r.actor_id) ?? "کاربر") : "سامانه",
        created_at: r.created_at,
      }));
    },
  });

  if (!canView) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری فعالیت‌ها...
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        بارگذاری خلاصهٔ حسابرسی با خطا مواجه شد.
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">رویداد حسابرسی مرتبطی یافت نشد.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{r.label}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>عامل: {r.actor}</span>
                <span title={r.created_at}>{formatDateTimeFa(r.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline" size="sm">
        <Link to="/admin/audit">مشاهدهٔ کامل حسابرسی</Link>
      </Button>
    </div>
  );
}
