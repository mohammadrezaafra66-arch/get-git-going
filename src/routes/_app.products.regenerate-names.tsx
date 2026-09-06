import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { regenerateProductNames, type RegenerateNameResult } from "@/lib/products/regenerate-names";

export const Route = createFileRoute("/_app/products/regenerate-names")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("products", "update"). `allowed` is the LIVE
  // role_permissions.products.can_update set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requirePermission("products", "update");
  },
  component: RegenerateNamesPage,
});

function RegenerateNamesPage() {
  const [categoryId, setCategoryId] = useState<string>("");
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RegenerateNameResult[]>([]);
  const [summary, setSummary] = useState<{
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const { data: cats } = useQuery({
    queryKey: ["cats-for-rename"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, naming_template")
        .order("name");
      return data ?? [];
    },
  });

  async function run() {
    setRunning(true);
    setResults([]);
    setSummary(null);
    setProgress({ done: 0, total: 0 });
    try {
      const collected: RegenerateNameResult[] = [];
      const res = await regenerateProductNames({
        categoryId: categoryId || null,
        dryRun,
        onProgress: (done, total, last) => {
          collected.push(last);
          setProgress({ done, total });
          if (collected.length % 5 === 0 || done === total) {
            setResults([...collected]);
          }
        },
      });
      setResults(collected);
      setSummary({ updated: res.updated, skipped: res.skipped, failed: res.failed });
      toast.success(
        dryRun
          ? `پیش‌نمایش: ${res.updated} نام قابل به‌روزرسانی`
          : `${res.updated} نام به‌روزرسانی شد` + (res.failed ? ` — ${res.failed} خطا` : ""),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در اجرا");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="ساخت خودکار نام محصولات"
        description="بازسازی نام محصولات قدیمی بر اساس الگوی نام‌گذاری دسته و ویژگی‌های پویا"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/products">
              <ArrowRight className="ms-1 h-4 w-4" />
              بازگشت
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>دسته (اختیاری)</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={running}
              >
                <option value="">همهٔ دسته‌ها</option>
                {(cats ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.naming_template ? "" : "(بدون الگو)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Checkbox
                id="dry"
                checked={dryRun}
                onCheckedChange={(v) => setDryRun(!!v)}
                disabled={running}
              />
              <Label htmlFor="dry" className="cursor-pointer">
                حالت پیش‌نمایش (بدون ذخیره)
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={run} disabled={running}>
              {running ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="ms-1 h-4 w-4" />
              )}
              {dryRun ? "اجرای پیش‌نمایش" : "ساخت و ذخیرهٔ نام‌ها"}
            </Button>
            {progress.total > 0 && (
              <span className="text-xs text-muted-foreground">
                {progress.done.toLocaleString("fa-IR")} / {progress.total.toLocaleString("fa-IR")}
              </span>
            )}
          </div>

          {progress.total > 0 && <Progress value={pct} />}

          {summary && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded border border-border p-2 text-center">
                <div className="text-xs text-muted-foreground">به‌روزرسانی</div>
                <div className="font-bold">{summary.updated.toLocaleString("fa-IR")}</div>
              </div>
              <div className="rounded border border-border p-2 text-center">
                <div className="text-xs text-muted-foreground">رد شده</div>
                <div className="font-bold">{summary.skipped.toLocaleString("fa-IR")}</div>
              </div>
              <div className="rounded border border-border p-2 text-center">
                <div className="text-xs text-muted-foreground">خطا</div>
                <div className="font-bold text-destructive">
                  {summary.failed.toLocaleString("fa-IR")}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 border-b bg-muted/60 text-right text-muted-foreground">
                  <tr>
                    <th className="p-2">وضعیت</th>
                    <th className="p-2">نام قبلی</th>
                    <th className="p-2">نام جدید</th>
                    <th className="p-2">توضیح</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={`${r.product_id}-${i}`} className="border-b last:border-0">
                      <td className="p-2">
                        {r.status === "updated" ? (
                          <span className="text-emerald-600">به‌روز</span>
                        ) : r.status === "error" ? (
                          <span className="text-destructive">خطا</span>
                        ) : (
                          <span className="text-muted-foreground">رد</span>
                        )}
                      </td>
                      <td className="p-2">{r.old_name}</td>
                      <td className="p-2 font-medium">{r.new_name}</td>
                      <td className="p-2 text-muted-foreground">{r.reason ?? "—"}</td>
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
