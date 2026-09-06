import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Send, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { formatNumber } from "@/lib/i18n/formatters";
import { ROLE_LABELS, type AppRole } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/pricing/sale-lists_/$listId/publish")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("pricing", "update"). `allowed` is the LIVE
  // role_permissions.pricing.can_update set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: {
    gate: {
      kind: "anyRole",
      allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"],
    },
  },
  beforeLoad: async () => {
    await requirePermission("pricing", "update");
  },
  component: PublishSaleListPage,
});

interface RecipientRow {
  id: string;
  full_name: string | null;
  roles: AppRole[];
}

function PublishSaleListPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["sale-list-publish", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_lists")
        .select("id, name, status, version_number, published_at")
        .eq("id", listId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const recipientsQ = useQuery({
    queryKey: ["publish-recipients"],
    queryFn: async () => {
      // Single query against the publish_recipients_view
      const { data, error } = await supabase
        .from("publish_recipients_view" as any)
        .select("id, full_name, roles");
      if (error) throw error;
      return (
        (data ?? []) as unknown as Array<{ id: string; full_name: string | null; roles: string[] }>
      )
        .map<RecipientRow>((r) => ({
          id: r.id,
          full_name: r.full_name,
          roles: (r.roles ?? []) as AppRole[],
        }))
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "fa"));
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const rows = recipientsQ.data ?? [];
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => (r.full_name ?? "").toLowerCase().includes(s));
  }, [recipientsQ.data, search]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.includes(r.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !filtered.some((r) => r.id === id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((r) => r.id)])));
    }
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const doPublish = async () => {
    if (selected.length === 0) {
      toast.error("حداقل یک مخاطب انتخاب کنید.");
      return;
    }
    setPublishing(true);
    try {
      const { data: userData, error: uErr } = await supabase.auth.getUser();
      if (uErr || !userData.user) throw new Error("کاربر شناسایی نشد.");

      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("sale_lists")
        .update({ status: "published", published_at: nowIso })
        .eq("id", listId);
      if (updErr) throw updErr;

      // Insert detailed audit log entry with recipients
      const { error: aErr } = await supabase.from("audit_logs").insert({
        action: "sale_list_published",
        entity_type: "sale_list",
        entity_id: listId,
        actor_id: userData.user.id,
        diff: {
          version_number: listQ.data?.version_number ?? null,
          published_to: selected,
          published_by: userData.user.id,
          published_at: nowIso,
          recipients_count: selected.length,
        },
      });
      if (aErr) console.warn("audit insert failed:", aErr);

      toast.success("لیست با موفقیت منتشر شد.");
      // Invalidate the details cache so the status badge updates immediately
      await queryClient.invalidateQueries({ queryKey: ["sale-list", listId] });
      await queryClient.invalidateQueries({ queryKey: ["sale-list-publish", listId] });
      navigate({ to: "/pricing/sale-lists/$listId", params: { listId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در انتشار لیست.";
      toast.error(msg);
    } finally {
      setPublishing(false);
      setConfirmOpen(false);
    }
  };

  const handlePublishClick = () => {
    if (selected.length === 0) {
      toast.error("حداقل یک مخاطب انتخاب کنید.");
      return;
    }
    if (listQ.data?.status === "published") {
      setConfirmOpen(true);
    } else {
      void doPublish();
    }
  };

  if (listQ.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (!listQ.data) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        لیست فروش یافت نشد.
      </div>
    );
  }

  const list = listQ.data;
  const isRepublish = list.status === "published";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`انتشار لیست فروش — ${list.name}`}
        description={`نسخه ${formatNumber(list.version_number)} • ${isRepublish ? "بازنشر" : "انتشار اولیه"}`}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/pricing/sale-lists/$listId" params={{ listId }}>
              <ArrowRight className="h-4 w-4" /> بازگشت
            </Link>
          </Button>
        }
      />

      {isRepublish && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          این لیست قبلاً منتشر شده است. انتشار مجدد یک رکورد جدید در گزارش‌های ممیزی ثبت می‌کند.
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> انتخاب مخاطبان
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو در نام کاربران..."
              className="pr-9"
            />
          </div>

          {recipientsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              هیچ کاربری یافت نشد.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  <span>انتخاب همه ({formatNumber(filtered.length)})</span>
                </label>
                <span>
                  <strong>{formatNumber(selected.length)}</strong> مخاطب انتخاب‌شده
                </span>
              </div>
              <div className="space-y-2">
                {filtered.map((r) => {
                  const checked = selected.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 ${checked ? "bg-muted/40" : ""}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{r.full_name ?? "بدون نام"}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.roles.map((role) => (
                            <Badge key={role} variant="secondary" className="text-[10px]">
                              {ROLE_LABELS[role]}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline" disabled={publishing}>
          <Link to="/pricing/sale-lists/$listId" params={{ listId }}>
            انصراف
          </Link>
        </Button>
        <Button
          onClick={handlePublishClick}
          disabled={publishing || selected.length === 0}
          className="gap-2"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isRepublish ? "بازنشر لیست" : "انتشار لیست"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید بازنشر لیست</AlertDialogTitle>
            <AlertDialogDescription>
              این لیست قبلاً منتشر شده است. آیا مطمئن هستید که می‌خواهید دوباره آن را منتشر کنید؟ یک
              رکورد جدید در گزارش‌های ممیزی ثبت خواهد شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing}
              onClick={(e) => {
                e.preventDefault();
                void doPublish();
              }}
            >
              {publishing ? "در حال بازنشر..." : "بازنشر"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
