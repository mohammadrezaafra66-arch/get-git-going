import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTaxonomy,
  listTaxonomies,
  softDeleteTaxonomy,
  updateTaxonomy,
  type WorkTaxonomy,
  type WorkTaxonomyKind,
} from "@/lib/work";

const KIND_TABS: { kind: WorkTaxonomyKind; label: string }[] = [
  { kind: "group", label: "گروه‌ها" },
  { kind: "section", label: "بخش‌ها" },
  { kind: "kind_label", label: "برچسب نوع" },
];

export function WorkTaxonomiesSettingsPage() {
  const [kind, setKind] = useState<WorkTaxonomyKind>("group");
  const [rows, setRows] = useState<WorkTaxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSort, setNewSort] = useState("0");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await listTaxonomies({ kind, includeInactive: true }),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const kindLabel = useMemo(
    () => KIND_TABS.find((t) => t.kind === kind)?.label ?? kind,
    [kind],
  );

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("نام الزامی است.");
      return;
    }
    const sort_order = Number.parseInt(newSort, 10);
    setCreating(true);
    try {
      await createTaxonomy({
        kind,
        name,
        sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      });
      toast.success("آیتم اضافه شد.");
      setNewName("");
      setNewSort("0");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "افزودن ناموفق بود.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(row: WorkTaxonomy, next: boolean) {
    setBusyId(row.id);
    try {
      await updateTaxonomy(row.id, { is_active: next });
      toast.success(next ? "فعال شد." : "غیرفعال شد.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "به‌روزرسانی ناموفق بود.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSortBlur(row: WorkTaxonomy, raw: string) {
    const sort_order = Number.parseInt(raw, 10);
    if (!Number.isFinite(sort_order) || sort_order === row.sort_order) return;
    setBusyId(row.id);
    try {
      await updateTaxonomy(row.id, { sort_order });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ذخیرهٔ ترتیب ناموفق بود.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRenameBlur(row: WorkTaxonomy, raw: string) {
    const name = raw.trim();
    if (!name || name === row.name) return;
    setBusyId(row.id);
    try {
      await updateTaxonomy(row.id, { name });
      toast.success("نام به‌روز شد.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تغییر نام ناموفق بود.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSoftDelete(row: WorkTaxonomy) {
    if (!window.confirm(`«${row.name}» حذف شود؟`)) return;
    setBusyId(row.id);
    try {
      await softDeleteTaxonomy(row.id);
      toast.success("حذف شد.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "حذف ناموفق بود.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="min-h-[70vh] bg-[linear-gradient(180deg,#f8fafc_0%,#f0fdfa_100%)]"
      dir="rtl"
      data-testid="work-taxonomies-settings"
    >
      <div className="container max-w-3xl space-y-5 py-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/operations/work">
            <ArrowRight className="h-4 w-4" />
            بازگشت به تابلو
          </Link>
        </Button>

        <PageHeader
          title="تنظیمات طبقه‌بندی کار"
          description="مدیریت گروه‌ها، بخش‌ها و برچسب‌های نوع برای دستیار کار"
        />

        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as WorkTaxonomyKind)}
          dir="rtl"
        >
          <TabsList className="grid w-full grid-cols-3">
            {KIND_TABS.map((t) => (
              <TabsTrigger key={t.kind} value={t.kind}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {KIND_TABS.map((t) => (
            <TabsContent key={t.kind} value={t.kind} className="space-y-4 pt-2">
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label htmlFor={`tax-new-name-${t.kind}`}>نام جدید</Label>
                  <Input
                    id={`tax-new-name-${t.kind}`}
                    value={kind === t.kind ? newName : ""}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`مثلاً برای ${kindLabel}`}
                    disabled={kind !== t.kind}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor={`tax-new-sort-${t.kind}`}>ترتیب</Label>
                  <Input
                    id={`tax-new-sort-${t.kind}`}
                    type="number"
                    value={kind === t.kind ? newSort : "0"}
                    onChange={(e) => setNewSort(e.target.value)}
                    disabled={kind !== t.kind}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleCreate()}
                  disabled={creating || kind !== t.kind}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  افزودن
                </Button>
              </div>

              {kind === t.kind && loading && (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال بارگذاری…
                </div>
              )}

              {kind === t.kind && error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              {kind === t.kind && !loading && !error && rows.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">
                  موردی ثبت نشده است.
                </p>
              )}

              {kind === t.kind && !loading && rows.length > 0 && (
                <ul className="space-y-2">
                  {rows.map((row) => {
                    const busy = busyId === row.id;
                    return (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm"
                      >
                        <Input
                          className="min-w-[8rem] flex-1"
                          defaultValue={row.name}
                          key={`${row.id}-name-${row.updated_at}`}
                          disabled={busy}
                          onBlur={(e) =>
                            void handleRenameBlur(row, e.target.value)
                          }
                          aria-label="نام"
                        />
                        <Input
                          className="w-20"
                          type="number"
                          defaultValue={String(row.sort_order)}
                          key={`${row.id}-sort-${row.updated_at}`}
                          disabled={busy}
                          onBlur={(e) =>
                            void handleSortBlur(row, e.target.value)
                          }
                          aria-label="ترتیب"
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.is_active}
                            disabled={busy}
                            onCheckedChange={(v) =>
                              void handleToggleActive(row, v)
                            }
                            aria-label="فعال"
                          />
                          <span className="text-xs text-slate-500">
                            {row.is_active ? "فعال" : "غیرفعال"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => void handleSoftDelete(row)}
                          aria-label="حذف"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
