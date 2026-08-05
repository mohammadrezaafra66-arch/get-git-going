import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import type { PersonContextLinkDTO } from "@/lib/persons/context-links.schemas";
import {
  CONTEXT_KIND_LABEL_FA,
  routeForContext,
  type DeepLinkState,
  type ResolvedDeepLink,
} from "@/lib/persons/profile-deep-links";

type ResolveOptions = {
  canOpenStaff: boolean;
  canOpenAccounting: boolean;
};

async function resolveOne(
  link: PersonContextLinkDTO,
  opts: ResolveOptions,
): Promise<ResolvedDeepLink> {
  const contextLabel = CONTEXT_KIND_LABEL_FA[link.context_kind] ?? link.context_kind;
  const base = {
    linkId: link.id,
    contextKind: link.context_kind,
    contextLabel,
    startedAt: link.started_at,
    endedAt: link.ended_at,
    note: link.note,
  };

  if (link.ended_at) {
    return { ...base, state: "ended", title: null, href: null };
  }

  const route = routeForContext(link.context_kind, link.ref_id);
  if (!route) {
    // Kind has no dossier route, or missing ref_id for kinds that need it.
    if (
      (link.context_kind === "customer" ||
        link.context_kind === "supplier" ||
        link.context_kind === "staff_link") &&
      !link.ref_id
    ) {
      return { ...base, state: "missing_ref", title: null, href: null };
    }
    return { ...base, state: "no_route", title: null, href: null };
  }

  if (route.needsAdminUsers && !opts.canOpenStaff) {
    return { ...base, state: "unavailable", title: null, href: null };
  }
  if (link.context_kind === "accounting_party" && !opts.canOpenAccounting) {
    return { ...base, state: "unavailable", title: null, href: null };
  }

  let title: string | null = null;
  let targetVisible = false;

  switch (link.context_kind) {
    case "customer": {
      if (!link.ref_id) return { ...base, state: "missing_ref", title: null, href: null };
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("id", link.ref_id)
        .maybeSingle();
      if (data) {
        targetVisible = true;
        title = data.name;
      }
      break;
    }
    case "supplier": {
      if (!link.ref_id) return { ...base, state: "missing_ref", title: null, href: null };
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("id", link.ref_id)
        .maybeSingle();
      if (data) {
        targetVisible = true;
        title = data.name;
      }
      break;
    }
    case "staff_link": {
      if (!link.ref_id) return { ...base, state: "missing_ref", title: null, href: null };
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", link.ref_id)
        .maybeSingle();
      if (data) {
        targetVisible = true;
        title = data.full_name?.trim() || "کاربر";
      }
      break;
    }
    case "accounting_party": {
      if (!link.ref_id) {
        // List route still exists; show without a specific title.
        return {
          ...base,
          state: "valid",
          title: "طرف‌های حساب خارجی",
          href: route.href,
        };
      }
      const { data } = await supabase
        .from("external_parties")
        .select("id, full_name")
        .eq("id", link.ref_id)
        .maybeSingle();
      if (data) {
        targetVisible = true;
        title = data.full_name;
      }
      break;
    }
    default:
      return { ...base, state: "no_route", title: null, href: null };
  }

  if (!targetVisible) {
    // Missing vs RLS-hidden: do not distinguish — avoids existence leak.
    return { ...base, state: "unavailable", title: null, href: null };
  }

  return { ...base, state: "valid", title, href: route.href };
}

function stateBadge(state: DeepLinkState) {
  switch (state) {
    case "valid":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">فعال</Badge>;
    case "ended":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          پایان‌یافته
        </Badge>
      );
    case "missing_ref":
      return (
        <Badge variant="outline" className="border-amber-500/50 text-amber-700">
          ارتباط ناقص
        </Badge>
      );
    case "no_route":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          بدون مسیر پرونده
        </Badge>
      );
    case "unavailable":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          غیرقابل نمایش
        </Badge>
      );
  }
}

function stateHint(row: ResolvedDeepLink): string {
  switch (row.state) {
    case "valid":
      return row.title ?? "—";
    case "ended":
      return row.title ?? "ارتباط پایان یافته";
    case "missing_ref":
      return "ارتباط ناقص";
    case "no_route":
      return "مسیر پرونده تعریف نشده";
    case "unavailable":
      return "پرونده مرتبط قابل نمایش نیست";
  }
}

export function PersonDeepLinks({
  personId,
  canOpenStaff,
  canOpenAccounting,
}: {
  personId: string;
  canOpenStaff: boolean;
  canOpenAccounting: boolean;
}) {
  const query = useQuery({
    queryKey: ["person", personId, "deep-links", canOpenStaff, canOpenAccounting],
    queryFn: async (): Promise<ResolvedDeepLink[]> => {
      const { data, error } = await supabase
        .from("person_context_links")
        .select(
          "id, person_id, context_kind, ref_table, ref_id, note, started_at, ended_at, created_by, created_at, updated_at",
        )
        .eq("person_id", personId)
        .order("ended_at", { ascending: true, nullsFirst: true })
        .order("started_at", { ascending: false });
      if (error) throw error;
      const links = (data ?? []) as PersonContextLinkDTO[];
      const resolved: ResolvedDeepLink[] = [];
      for (const link of links) {
        resolved.push(
          await resolveOne(link, { canOpenStaff, canOpenAccounting }),
        );
      }
      return resolved;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری نقش‌ها...
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        بارگذاری نقش‌ها و پرونده‌های مرتبط با خطا مواجه شد.
      </div>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        هیچ نقشی برای این شخص ثبت نشده است.
      </p>
    );
  }

  const active = rows.filter((r) => r.state !== "ended");
  const ended = rows.filter((r) => r.state === "ended");

  return (
    <div className="space-y-4">
      <DeepLinkTable rows={active} empty="نقش فعالی ثبت نشده است." />
      {ended.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">نقش‌های پایان‌یافته</h4>
          <DeepLinkTable rows={ended} empty="" />
        </div>
      ) : null}
    </div>
  );
}

function DeepLinkTable({ rows, empty }: { rows: ResolvedDeepLink[]; empty: string }) {
  if (rows.length === 0) {
    return empty ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.linkId} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{row.contextLabel}</div>
              <div className="break-words text-muted-foreground">{stateHint(row)}</div>
              <div className="flex flex-wrap gap-2">{stateBadge(row.state)}</div>
              <div className="text-xs text-muted-foreground" title={row.startedAt}>
                از {formatDateTimeFa(row.startedAt)}
                {row.endedAt ? ` · تا ${formatDateTimeFa(row.endedAt)}` : ""}
              </div>
            </div>
            {row.state === "valid" && row.href ? (
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href={row.href}>
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  باز کردن پرونده
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
