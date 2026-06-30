import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Sparkles, Calendar, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { HelpHint } from "@/components/common/HelpHint";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useScoringParameters,
  useEntityScores,
  useUpsertEntityScore,
  useCalculatedScore,
  useCustomerLatestAllocation,
  useSalespersonLatestAllocation,
  currentPeriodMonth,
  type CalculatedScoreBreakdownItem,
  type EntityType,
} from "@/hooks/credit/useDynamicScoring";

function bindingLabel(c: string): { label: string; cls: string } {
  switch (c) {
    case "overdue":
      return { label: "بسته (معوقه)", cls: "bg-destructive text-destructive-foreground" };
    case "credit_limit":
      return { label: "سقف اعتبار", cls: "bg-amber-500 text-white" };
    case "floor":
      return { label: "کف", cls: "bg-muted" };
    case "formula":
    default:
      return { label: "فرمول", cls: "bg-emerald-600 text-white" };
  }
}

export function DynamicScoringSection({
  entityType,
  entityId,
  canEdit,
}: {
  entityType: EntityType;
  entityId: string;
  canEdit: boolean;
}) {
  const period = currentPeriodMonth();
  const { user } = useAuth();

  const paramsQ = useScoringParameters(entityType);
  const scoresQ = useEntityScores(entityType, entityId, period);
  const calcQ = useCalculatedScore(entityType, entityId, period);
  const customerAllocQ = useCustomerLatestAllocation(
    entityType === "customer" ? entityId : undefined,
  );
  const salespersonAllocQ = useSalespersonLatestAllocation(
    entityType === "salesperson" ? entityId : undefined,
  );
  const upsert = useUpsertEntityScore();

  // dirty state per parameter — local slider values
  const [draft, setDraft] = useState<Record<string, number>>({});

  const savedByParam = useMemo(() => {
    const map: Record<string, number> = {};
    (scoresQ.data ?? []).forEach((s) => {
      map[s.parameter_id] = Number(s.raw_score);
    });
    return map;
  }, [scoresQ.data]);

  // initialize draft when params/scores load (and reset when customer changes)
  useEffect(() => {
    if (!paramsQ.data) return;
    const next: Record<string, number> = {};
    paramsQ.data.forEach((p) => {
      next[p.id] = savedByParam[p.id] ?? 0;
    });
    setDraft(next);
  }, [paramsQ.data, savedByParam]);

  const breakdownByParam = useMemo(() => {
    const map: Record<string, CalculatedScoreBreakdownItem> = {};
    calcQ.data?.breakdown?.forEach((b) => {
      map[b.parameter_id] = b;
    });
    return map;
  }, [calcQ.data]);

  const weighted = Number(calcQ.data?.weighted_score ?? 0);
  const weightedPct = Math.max(0, Math.min(100, weighted * 100));

  // Normalize allocation data across entity types
  const allocView = (() => {
    if (entityType === "customer") {
      const a = customerAllocQ.data;
      if (!a) return null;
      return {
        capital_date: a.capital_date,
        amount: a.final_limit,
        binding: bindingLabel(a.binding_constraint),
        amountLabel: "سقف نهایی آخرین snapshot",
      };
    }
    const a = salespersonAllocQ.data;
    if (!a) return null;
    return {
      capital_date: a.capital_date,
      amount: a.allocated_capital,
      binding: null as ReturnType<typeof bindingLabel> | null,
      amountLabel: "تخصیص آخرین snapshot",
    };
  })();

  const handleSave = (paramId: string) => {
    const value = draft[paramId] ?? 0;
    upsert.mutate(
      {
        entity_type: entityType,
        entity_id: entityId,
        parameter_id: paramId,
        period_month: period,
        raw_score: value,
        scored_by: user?.id ?? null,
      },
      {
        onSuccess: () => toast.success("امتیاز ذخیره شد"),
        onError: (e) =>
          toast.error(`خطا در ذخیره: ${e instanceof Error ? e.message : "ناشناخته"}`),
      },
    );
  };

  const loading = paramsQ.isLoading || scoresQ.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          امتیازدهی پویا — ماه جاری
          <HelpHint
            text={
              "این بخش پارامترهای ارزیابی ماهانه‌ی مشتری را نمایش می‌دهد.\n" +
              "• هر پارامتر مقداری بین ۰ تا ۱ می‌گیرد.\n" +
              "• امتیاز وزنی کل = مجموع (امتیاز × وزن نرمال‌شده).\n" +
              "• فقط مدیر یا حسابدار می‌تواند مقادیر را تغییر دهد."
            }
          />
          {!canEdit && (
            <Badge variant="secondary" className="mr-2">
              فقط مشاهده
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              امتیاز وزنی کل
            </div>
            <div className="text-lg font-bold">{toFaDigits(weighted.toFixed(3))}</div>
            <Progress value={weightedPct} className="h-2" />
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              آخرین تخصیص سرمایه
            </div>
            <div className="text-sm font-medium">
              {alloc ? formatDateTimeFa(alloc.capital_date) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {alloc ? "تاریخ snapshot" : "هنوز snapshot تولید نشده"}
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              سقف نهایی آخرین snapshot
            </div>
            <div className="text-sm font-bold">
              {alloc ? `${formatNumber(alloc.final_limit)} ریال` : "—"}
            </div>
            {binding && (
              <Badge className={`text-[10px] ${binding.cls}`}>{binding.label}</Badge>
            )}
          </div>
        </div>

        {/* Parameters */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری پارامترها...
          </div>
        ) : (paramsQ.data ?? []).length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            پارامتر فعالی برای مشتری تعریف نشده است.
          </div>
        ) : (
          <div className="space-y-3">
            {paramsQ.data!.map((p) => {
              const current = draft[p.id] ?? 0;
              const saved = savedByParam[p.id];
              const dirty = saved === undefined || Math.abs(current - saved) > 1e-9;
              const bd = breakdownByParam[p.id];
              return (
                <div
                  key={p.id}
                  className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="sm:w-56 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      <span className="truncate">{p.label_fa}</span>
                      {saved === undefined && (
                        <Badge variant="outline" className="text-[10px]">
                          ثبت نشده
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{p.code}</div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Slider
                      value={[current]}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={!canEdit || upsert.isPending}
                      onValueChange={(v) =>
                        setDraft((d) => ({ ...d, [p.id]: v[0] ?? 0 }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:w-44 justify-end">
                    <div className="text-sm font-mono w-12 text-center">
                      {toFaDigits(current.toFixed(2))}
                    </div>
                    {bd && (
                      <Badge variant="secondary" className="text-[10px]">
                        مشارکت {toFaDigits(Number(bd.contribution).toFixed(3))}
                      </Badge>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        disabled={!dirty || upsert.isPending}
                        onClick={() => handleSave(p.id)}
                      >
                        {upsert.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}