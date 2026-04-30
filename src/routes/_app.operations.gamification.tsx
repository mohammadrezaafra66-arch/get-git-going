import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, Save } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listKpis, updateKpi, type GamificationKpi } from "@/lib/operations/gamification";

export const Route = createFileRoute("/_app/operations/gamification")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager"]); },
  component: GamificationAdminPage,
});

function GamificationAdminPage() {
  const qc = useQueryClient();
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["gamification-kpis"],
    queryFn: listKpis,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="مدیریت گیمیفیکیشن"
        description="پارامترهای KPI و وزن آن‌ها برای محاسبه امتیاز کارشناسان فروش."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-primary" />
            پارامترهای امتیازدهی (KPI)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : !kpis?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">پارامتری ثبت نشده است.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">عنوان</th>
                    <th className="p-3 font-medium">منبع</th>
                    <th className="p-3 font-medium">واحد</th>
                    <th className="p-3 font-medium">وزن</th>
                    <th className="p-3 font-medium">فعال</th>
                    <th className="p-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k) => (
                    <KpiRow key={k.id} kpi={k} onSaved={() => qc.invalidateQueries({ queryKey: ["gamification-kpis"] })} />
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

function KpiRow({ kpi, onSaved }: { kpi: GamificationKpi; onSaved: () => void }) {
  const [weight, setWeight] = useState<string>(String(kpi.weight));
  const [enabled, setEnabled] = useState<boolean>(kpi.enabled);

  const mutation = useMutation({
    mutationFn: () => updateKpi({
      id: kpi.id,
      weight: Number(weight),
      enabled,
    }),
    onSuccess: () => {
      toast.success("پارامتر به‌روزرسانی شد.");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا در ذخیره."),
  });

  const dirty = Number(weight) !== kpi.weight || enabled !== kpi.enabled;
  const weightNum = Number(weight);
  const validWeight = Number.isFinite(weightNum) && weightNum >= 0;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 align-top">
      <td className="p-3">
        <div className="font-medium">{kpi.label_fa}</div>
        {kpi.description ? (
          <div className="mt-1 text-xs text-muted-foreground">{kpi.description}</div>
        ) : null}
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        <Badge variant="outline">{kpi.source}</Badge>
      </td>
      <td className="p-3 text-xs text-muted-foreground">{kpi.unit ?? "—"}</td>
      <td className="p-3">
        <Input
          type="number"
          step="0.0001"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-8 w-28"
          dir="ltr"
        />
      </td>
      <td className="p-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </td>
      <td className="p-3">
        <Button
          size="sm"
          variant="default"
          disabled={!dirty || !validWeight || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Save className="ml-1 h-4 w-4" />
          ذخیره
        </Button>
      </td>
    </tr>
  );
}