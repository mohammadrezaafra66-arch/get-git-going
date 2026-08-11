import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { HelpHint } from "@/components/common/HelpHint";
import { CreditZeroReasonPanel } from "@/components/credit/CreditZeroReasonPanel";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useScoringParameters,
  useEntityScores,
  useUpsertEntityScore,
  useCalculatedScore,
  useCustomerLatestAllocation,
  useSalespersonLatestAllocation,
  useCustomerRealtimeCredit,
  currentPeriodMonth,
  type CalculatedScoreBreakdownItem,
  type EntityType,
  type ScoringParameter,
} from "@/hooks/credit/useDynamicScoring";

function bindingLabel(c: string): { label: string; cls: string } {
  switch (c) {
    case "overdue":
      return { label: "بسته (معوقه)", cls: "bg-destructive text-destructive-foreground" };
    case "credit_limit":
      return { label: "سقف اعتبار", cls: "bg-amber-500 text-white" };
    case "floor":
      return { label: "کف", cls: "bg-muted" };
    case "no_salesperson":
      return { label: "بدون کارشناس", cls: "bg-destructive text-destructive-foreground" };
    case "no_capital":
      return { label: "بدون سرمایه", cls: "bg-destructive text-destructive-foreground" };
    case "formula":
    default:
      return { label: "فرمول", cls: "bg-emerald-600 text-white" };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeNormalized(p: ScoringParameter, actual: number): number {
  if (p.input_type === "boolean") return actual >= 1 ? 1 : 0;
  const min = Number(p.min_value ?? 0);
  const max = Number(p.max_value ?? 1);
  if (max <= min) return 0;
  return clamp01((actual - min) / (max - min));
}

function isClippedFor(p: ScoringParameter, actual: number): boolean {
  if (p.input_type === "boolean") return false;
  return actual > Number(p.max_value ?? 1);
}

function initialActualFor(
  p: ScoringParameter,
  saved: { actual_value: number | null; raw_score: number } | undefined,
): number {
  if (!saved) return 0;
  if (saved.actual_value !== null && saved.actual_value !== undefined) {
    return Number(saved.actual_value);
  }
  // fallback: reverse from raw_score
  if (p.input_type === "boolean") return saved.raw_score >= 0.5 ? 1 : 0;
  const min = Number(p.min_value ?? 0);
  const max = Number(p.max_value ?? 1);
  return min + Number(saved.raw_score) * (max - min);
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
  const qc = useQueryClient();

  const paramsQ = useScoringParameters(entityType);
  const scoresQ = useEntityScores(entityType, entityId, period);
  const calcQ = useCalculatedScore(entityType, entityId, period);
  const customerAllocQ = useCustomerLatestAllocation(
    entityType === "customer" ? entityId : undefined,
  );
  const salespersonAllocQ = useSalespersonLatestAllocation(
    entityType === "salesperson" ? entityId : undefined,
  );
  const realtimeQ = useCustomerRealtimeCredit(entityType === "customer" ? entityId : undefined);
  const upsert = useUpsertEntityScore();

  // Realtime: when weights or params change, or today's allocation is rewritten,
  // refresh the calculated score and allocation for this entity.
  useEffect(() => {
    const channel = supabase
      .channel(`dyn-scoring-${entityType}-${entityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dynamic_parameter_weights" },
        () => {
          qc.invalidateQueries({ queryKey: ["dyn-calculated-score", entityType, entityId] });
          qc.invalidateQueries({ queryKey: ["dyn-scoring-parameters", entityType] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dynamic_scoring_parameters" },
        () => {
          qc.invalidateQueries({ queryKey: ["dyn-scoring-parameters", entityType] });
          qc.invalidateQueries({ queryKey: ["dyn-calculated-score", entityType, entityId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_capital_allocations_dynamic" },
        () => {
          qc.invalidateQueries({ queryKey: ["dyn-customer-latest-allocation", entityId] });
          qc.invalidateQueries({ queryKey: ["dyn-salesperson-latest-allocation", entityId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityType, entityId, qc]);

  // dirty state per parameter — local actual values
  const [draftActual, setDraftActual] = useState<Record<string, number>>({});

  const savedByParam = useMemo(() => {
    const map: Record<string, { raw_score: number; actual_value: number | null }> = {};
    (scoresQ.data ?? []).forEach((s) => {
      map[s.parameter_id] = {
        raw_score: Number(s.raw_score),
        actual_value:
          s.actual_value === null || s.actual_value === undefined ? null : Number(s.actual_value),
      };
    });
    return map;
  }, [scoresQ.data]);

  // initialize draft when params/scores load (and reset when customer changes)
  useEffect(() => {
    if (!paramsQ.data) return;
    const next: Record<string, number> = {};
    paramsQ.data.forEach((p) => {
      next[p.id] = initialActualFor(p, savedByParam[p.id]);
    });
    setDraftActual(next);
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

  // D8-4 (migration 272): the band comes from the DB, resolved against the
  // threshold version in force at the score's own period. It is deliberately
  // NOT recomputed here -- a second copy of the boundaries in the client would
  // drift from the versioned table the moment an admin edits it.
  const levelLabel = calcQ.data?.level_label ?? null;
  const levelBadgeClass =
    {
      excellent: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
      trusted: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
      medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
      high_risk: "bg-destructive/15 text-destructive",
    }[calcQ.data?.level_code ?? ""] ?? "bg-muted text-muted-foreground";

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

  const handleSave = (p: ScoringParameter) => {
    const actual = draftActual[p.id] ?? 0;
    const normalized = computeNormalized(p, actual);
    const clipped = isClippedFor(p, actual);
    upsert.mutate(
      {
        entity_type: entityType,
        entity_id: entityId,
        parameter_id: p.id,
        period_month: period,
        raw_score: normalized,
        actual_value: actual,
        is_clipped: clipped,
        scored_by: user?.id ?? null,
      },
      {
        onSuccess: () => toast.success("امتیاز ذخیره شد"),
        onError: (e) => toast.error(`خطا در ذخیره: ${e instanceof Error ? e.message : "ناشناخته"}`),
      },
    );
  };

  const loading = paramsQ.isLoading || scoresQ.isLoading;

  return (
    <Card data-testid={`dynamic-score-card-${entityType}`}>
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
        <p className="text-xs text-muted-foreground mt-1">
          پس از ۶۰ ثانیه، عدد سقف اعتبار مؤثر بر اساس داده جدید تغییر خواهد کرد.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {entityType === "customer" && realtimeQ.data && (
          <div className="rounded-xl border-2 border-green-500/40 bg-green-50 dark:bg-green-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                سقف اعتبار — محاسبه زنده
              </span>
              <Badge
                variant="outline"
                className="text-green-700 border-green-500 text-[10px] gap-1"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                زنده
              </Badge>
            </div>
            <div
              className="text-2xl font-bold text-primary"
              data-testid="customer-realtime-credit-final-limit"
            >
              {formatNumber(realtimeQ.data.final_limit)}
              <span className="text-sm font-normal text-muted-foreground mr-2">تومان</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                امتیاز وزنی: {toFaDigits(Number(realtimeQ.data.weighted_score ?? 0).toFixed(3))}
              </span>
              <span>·</span>
              <span>
                {toFaDigits(realtimeQ.data.params_evaluated)} از{" "}
                {toFaDigits(realtimeQ.data.params_active)} پارامتر ارزیابی شده
              </span>
              <span>·</span>
              <Badge
                data-testid="customer-credit-binding-constraint"
                className={`text-[10px] ${bindingLabel(realtimeQ.data.binding_constraint).cls}`}
              >
                {bindingLabel(realtimeQ.data.binding_constraint).label}
              </Badge>
            </div>
            {realtimeQ.data.is_capital_stale && realtimeQ.data.capital_date_used && (
              <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  سرمایه از تاریخ {formatDateTimeFa(realtimeQ.data.capital_date_used)} (قدیمی)
                  استفاده شده
                </span>
              </div>
            )}
            {realtimeQ.data.binding_constraint === "no_capital" && (
              <div className="text-xs text-destructive">
                هنوز سرمایه‌ای برای کارشناس تخصیص داده نشده است.
              </div>
            )}
            {realtimeQ.data.binding_constraint === "no_salesperson" && (
              <div className="text-xs text-destructive">
                این مشتری به هیچ کارشناسی متصل نیست؛ سقف اعتبار محاسبه نمی‌شود.
              </div>
            )}
          </div>
        )}

        {/* مورد ۱۳۳ — تشخیص علت صفر شدن سقف اعتبار (خودش تصمیم می‌گیرد که
            در حالت عادی اصلاً رندر نشود). */}
        {entityType === "customer" && realtimeQ.data && (
          <CreditZeroReasonPanel data={realtimeQ.data} />
        )}

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              امتیاز وزنی کل
            </div>
            <div className="flex items-center gap-2">
              <div
                className="text-lg font-bold"
                data-testid={
                  entityType === "customer"
                    ? "customer-weighted-score"
                    : "salesperson-weighted-score"
                }
              >
                {toFaDigits(weighted.toFixed(3))}
              </div>
              {/* D8-4: the band next to the number. Absent for periods with no
                  threshold version -- we show nothing rather than guess. */}
              {levelLabel && (
                <Badge className={levelBadgeClass} data-testid="score-level-badge">
                  {levelLabel}
                </Badge>
              )}
            </div>
            <Progress value={weightedPct} className="h-2" />
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
              const current = draftActual[p.id] ?? 0;
              const saved = savedByParam[p.id];
              const savedActual = saved ? initialActualFor(p, saved) : undefined;
              const dirty = savedActual === undefined || Math.abs(current - savedActual) > 1e-9;
              const bd = breakdownByParam[p.id];
              const normalized = computeNormalized(p, current);
              const clipped = isClippedFor(p, current);
              const disabled = !canEdit || upsert.isPending;
              const setVal = (v: number) =>
                setDraftActual((d) => ({ ...d, [p.id]: Number.isFinite(v) ? v : 0 }));

              return (
                <div key={p.id} className="rounded-md border p-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
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

                    <div className="flex-1 min-w-0 space-y-1">
                      {p.input_type === "boolean" && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={current >= 1}
                            disabled={disabled}
                            onCheckedChange={(v) => setVal(v ? 1 : 0)}
                          />
                          <span className="text-sm">{current >= 1 ? "بله" : "خیر"}</span>
                        </div>
                      )}

                      {p.input_type === "score_100" && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Slider
                              value={[Math.max(0, Math.min(100, current))]}
                              min={0}
                              max={100}
                              step={1}
                              disabled={disabled}
                              onValueChange={(v) => setVal(v[0] ?? 0)}
                            />
                          </div>
                          <div className="text-sm font-mono w-14 text-center">
                            {toFaDigits(Math.round(current))}
                          </div>
                        </div>
                      )}

                      {p.input_type === "score_input" && (
                        <div className="space-y-1">
                          <Input
                            data-testid={`score-input-${p.code}`}
                            type="text"
                            inputMode="numeric"
                            dir="ltr"
                            className="text-left font-mono w-24"
                            disabled={disabled}
                            value={String(Math.round(current))}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              const n = raw ? Number(raw) : 0;
                              setVal(Math.min(100, Math.max(0, n)));
                            }}
                          />
                          <div className="text-[11px] text-muted-foreground">
                            {p.input_hint ?? "عددی بین ۰ تا ۱۰۰"}
                          </div>
                        </div>
                      )}

                      {(p.input_type === "toman" || p.input_type === "months") && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              data-testid={`score-input-${p.code}`}
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              className="text-left font-mono"
                              disabled={disabled}
                              value={
                                p.input_type === "toman"
                                  ? current
                                    ? current.toLocaleString("en-US")
                                    : ""
                                  : current
                                    ? String(current)
                                    : ""
                              }
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                setVal(raw ? Number(raw) : 0);
                              }}
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {p.unit_label ?? (p.input_type === "toman" ? "تومان" : "ماه")}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.input_hint ??
                              `از ${toFaDigits(Number(p.min_value).toLocaleString("en-US"))} تا ${toFaDigits(Number(p.max_value).toLocaleString("en-US"))}`}
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-muted-foreground">
                        امتیاز نرمال‌شده: {toFaDigits(normalized.toFixed(2))}
                      </div>

                      {clipped && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          از سقف تعریف‌شده بیشتر است — مقدار در ۱ محدود می‌شود
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:w-40 justify-end">
                      {bd && (
                        <Badge variant="secondary" className="text-[10px]">
                          مشارکت {toFaDigits(Number(bd.contribution).toFixed(3))}
                        </Badge>
                      )}
                      {canEdit && (
                        <Button
                          data-testid={`score-save-${p.code}`}
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || upsert.isPending}
                          onClick={() => handleSave(p)}
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
