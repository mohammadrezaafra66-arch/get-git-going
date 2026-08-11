import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Merge } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export type MergeCandidateView = {
  id: string;
  person_id_a: string;
  person_id_b: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
  other_person_id: string;
  other_display_name: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار بررسی",
  dismissed: "رد شده",
  rejected: "رد شده",
  not_duplicate: "تکراری نیست",
  merged: "ادغام‌شده",
};

function statusBadge(status: string) {
  if (status === "pending") {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "merged") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{STATUS_LABEL[status]}</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function PersonMergePanel({
  personId,
  canReview,
}: {
  personId: string;
  canReview: boolean;
}) {
  const query = useQuery({
    queryKey: ["person", personId, "merge-candidates"],
    enabled: canReview,
    queryFn: async (): Promise<MergeCandidateView[]> => {
      const { data, error } = await supabase
        .from("person_merge_candidates" as never)
        .select("id, person_id_a, person_id_b, reason, detail, status, created_at")
        .or(`person_id_a.eq.${personId},person_id_b.eq.${personId}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = (data ?? []) as Omit<MergeCandidateView, "other_person_id" | "other_display_name">[];
      const otherIds = [
        ...new Set(
          rows.map((r) => (r.person_id_a === personId ? r.person_id_b : r.person_id_a)),
        ),
      ];
      const nameById = new Map<string, string>();
      if (otherIds.length) {
        const { data: persons } = await supabase
          .from("persons")
          .select("id, display_name")
          .in("id", otherIds);
        for (const p of persons ?? []) {
          nameById.set(p.id, p.display_name);
        }
      }
      return rows.map((r) => {
        const other = r.person_id_a === personId ? r.person_id_b : r.person_id_a;
        return {
          ...r,
          other_person_id: other,
          other_display_name: nameById.get(other) ?? null,
        };
      });
    },
  });

  if (!canReview) {
    return (
      <p className="text-sm text-muted-foreground">
        وضعیت ادغام برای این نقش قابل نمایش نیست.
      </p>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        بارگذاری وضعیت ادغام با خطا مواجه شد.
      </div>
    );
  }

  const rows = query.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const other = rows.filter((r) => r.status !== "pending");

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">نامزد ادغامی برای این شخص ثبت نشده است.</p>
    );
  }

  return (
    <div className="space-y-3">
      {pending.length > 0 ? (
        <div className="space-y-2">
          {pending.map((r) => (
            <div
              key={r.id}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(r.status)}
                <span className="font-medium">
                  {r.other_display_name ?? "شخص دیگر (دسترسی محدود)"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                دلیل: {r.reason}
                {r.detail ? ` — ${r.detail}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground" title={r.created_at}>
                ثبت: {formatDateTimeFa(r.created_at)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">نامزد فعالی در صف بررسی نیست.</p>
      )}

      {other.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            سوابق دیگر ({other.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {other.map((r) => (
              <li key={r.id} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(r.status)}
                  <span>{r.other_display_name ?? "شخص دیگر (دسترسی محدود)"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground" title={r.created_at}>
                  {r.reason} · {formatDateTimeFa(r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Button asChild variant="outline" size="sm">
        <Link to="/persons/merge">
          <Merge className="ml-1 h-3.5 w-3.5" />
          بررسی اشخاص تکراری
        </Link>
      </Button>
    </div>
  );
}
