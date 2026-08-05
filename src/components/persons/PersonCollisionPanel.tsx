import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, PhoneOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import type { PersonIdentifierDTO } from "@/lib/persons/identifiers.functions";

type EntityRef = { table: string; id: string; label: string | null };

type CollisionRow = {
  id: string;
  normalized_phone: string;
  entity_refs: EntityRef[];
  detected_at: string;
  status: "pending" | "resolved" | "ignored";
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

const STATUS_LABEL: Record<CollisionRow["status"], string> = {
  pending: "در انتظار بررسی",
  resolved: "بررسی‌شده",
  ignored: "نادیده گرفته شد",
};

function e164ToLocalMobile(value: string): string | null {
  const v = value.trim();
  if (/^\+98\d{10}$/.test(v)) return `0${v.slice(3)}`;
  if (/^09\d{9}$/.test(v)) return v;
  return null;
}

function statusBadge(status: CollisionRow["status"]) {
  if (status === "pending") {
    return (
      <Badge className="bg-destructive text-white hover:bg-destructive">{STATUS_LABEL[status]}</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function otherPartyLabel(refs: EntityRef[], ownIds: Set<string>): string {
  const others = refs.filter((r) => !ownIds.has(r.id));
  if (others.length === 0) return "فقط همین شخص در تداخل دیده می‌شود";
  const visible = others.filter((r) => r.label && r.label.trim());
  if (visible.length === 0) return "شخص دیگر با دسترسی محدود";
  return visible.map((r) => r.label!.trim()).join("، ");
}

export function PersonCollisionPanel({
  personId,
  identifiers,
  canSee,
  canReviewQueue,
}: {
  personId: string;
  identifiers: PersonIdentifierDTO[] | undefined;
  canSee: boolean;
  canReviewQueue: boolean;
}) {
  const query = useQuery({
    queryKey: ["person", personId, "phone-collisions", identifiers],
    enabled: canSee && identifiers !== undefined,
    queryFn: async (): Promise<{ rows: CollisionRow[]; ownIds: string[] }> => {
      const locals = (identifiers ?? [])
        .filter((i) => i.kind === "mobile_e164" && i.status !== "revoked")
        .map((i) => e164ToLocalMobile(i.value_normalized))
        .filter((v): v is string => !!v);

      const ownIds = new Set<string>();
      // Live schema has person_id on suppliers/profiles; generated types lag.
      const [{ data: customers }, suppliersRes, profilesRes] = await Promise.all([
        supabase.from("customers").select("id").eq("person_id", personId),
        supabase
          .from("suppliers")
          .select("id")
          .filter("person_id", "eq", personId),
        supabase
          .from("profiles")
          .select("id")
          .filter("person_id", "eq", personId),
      ]);
      for (const r of customers ?? []) ownIds.add(r.id);
      for (const r of (suppliersRes.data ?? []) as { id: string }[]) ownIds.add(r.id);
      for (const r of (profilesRes.data ?? []) as { id: string }[]) ownIds.add(r.id);

      const { data, error } = await supabase
        .from("phone_collisions")
        .select(
          "id, normalized_phone, entity_refs, detected_at, status, resolution_note, resolved_at, resolved_by",
        )
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const all = (data ?? []) as unknown as CollisionRow[];
      const rows = all.filter((row) => {
        if (locals.includes(row.normalized_phone)) return true;
        const refs = Array.isArray(row.entity_refs) ? row.entity_refs : [];
        return refs.some((r) => ownIds.has(r.id));
      });
      return { rows, ownIds: [...ownIds] };
    },
  });

  if (!canSee) {
    return (
      <p className="text-sm text-muted-foreground">
        وضعیت تداخل شماره برای این نقش قابل نمایش نیست.
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
        بارگذاری تداخل شماره با خطا مواجه شد.
      </div>
    );
  }

  const rows = query.data?.rows ?? [];
  const ownIds = new Set(query.data?.ownIds ?? []);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">تداخل شماره‌ای مرتبط با این شخص ثبت نشده است.</p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const refs = Array.isArray(row.entity_refs) ? row.entity_refs : [];
        return (
          <div
            key={row.id}
            className={
              row.status === "pending"
                ? "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
                : "rounded-md border p-3 text-sm"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <PhoneOff className="h-4 w-4 text-destructive" />
              {statusBadge(row.status)}
              <span className="font-mono" dir="ltr">
                {row.normalized_phone}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              طرف‌های دیگر: {otherPartyLabel(refs, ownIds)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" title={row.detected_at}>
              تشخیص: {formatDateTimeFa(row.detected_at)}
              {row.resolved_at ? ` · رسیدگی: ${formatDateTimeFa(row.resolved_at)}` : ""}
            </p>
          </div>
        );
      })}
      {canReviewQueue ? (
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/phone-collisions">مشاهدهٔ صف تداخل</Link>
        </Button>
      ) : null}
    </div>
  );
}
