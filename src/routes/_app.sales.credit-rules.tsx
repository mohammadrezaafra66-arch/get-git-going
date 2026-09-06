import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { isoToJalaliDisplay } from "@/lib/i18n/jalali";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/sales/credit-rules")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors the requireAnyRole call below, which is this route's own authority.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: CreditRulesPage,
});

interface Rule {
  id: string;
  code: string;
  label_fa: string;
  /** The value the editor works on: the pending version if one is scheduled, otherwise the one in force. */
  weight: number;
  is_active: boolean;
  direction: string;
  /** The weight actually in force today. */
  currentWeight: number;
  /** Set only when a change has been scheduled but has not taken effect yet (migration 266). */
  pendingWeight: number | null;
  pendingFrom: string | null;
}

/** What upsert_dynamic_parameter_weight returns since migration 266. */
interface WeightUpsertResult {
  outcome: "scheduled_next_period" | "pending_version_corrected" | "bootstrapped" | "unchanged";
  effective_from: string | null;
}

// Item 141.2 — this page manages both scoring sides. Customer scores drive a
// customer's share of its salesperson's capital; salesperson scores drive the
// salesperson's share of the daily total.
type ScoringEntityType = "customer" | "salesperson";

const ENTITY_META: Record<ScoringEntityType, { tab: string; title: string; desc: string }> = {
  customer: {
    tab: "مشتریان",
    title: "پارامترهای امتیازدهی مشتری",
    desc: "امتیاز مشتری تعیین می‌کند چه سهمی از سرمایهٔ کارشناس مسئولش دریافت کند.",
  },
  salesperson: {
    tab: "کارشناسان فروش",
    title: "پارامترهای امتیازدهی کارشناس فروش",
    desc: "امتیاز کارشناس تعیین می‌کند چه سهمی از سرمایه کل روز به او تخصیص یابد.",
  },
};

function CreditRulesPage() {
  const [entityType, setEntityType] = useState<ScoringEntityType>("customer");
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasAnyRole(roles, ["admin", "accountant"]);

  useEffect(() => {
    const channel = supabase
      .channel("credit-rules-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dynamic_parameter_weights" },
        () => queryClient.invalidateQueries({ queryKey: ["credit-rules"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dynamic_scoring_parameters" },
        () => queryClient.invalidateQueries({ queryKey: ["credit-rules"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["credit-rules", entityType],
    queryFn: async () => {
      const { data: params, error: pErr } = await supabase
        .from("dynamic_scoring_parameters")
        .select("id, code, label_fa, is_active, direction, display_order")
        .eq("entity_type", entityType)
        .order("display_order", { ascending: true });
      if (pErr) throw pErr;
      const ids = (params ?? []).map((p) => p.id);
      if (ids.length === 0) return [];
      // Since migration 266 a weight change no longer edits the row in force —
      // it closes it and schedules a new version from the next period. So a
      // parameter can legitimately have BOTH a version in force and a pending
      // one, and filtering on `valid_to is null` would have shown only the
      // pending value while labelling it as current.
      const { data: weights, error: wErr } = await supabase
        .from("dynamic_parameter_weights")
        .select("parameter_id, weight, valid_from, valid_to")
        .in("parameter_id", ids)
        .order("valid_from", { ascending: true });
      if (wErr) throw wErr;

      const today = new Date().toISOString().slice(0, 10);
      const currentMap = new Map<string, number>();
      const pendingMap = new Map<string, { weight: number; from: string }>();
      (weights ?? []).forEach((w) => {
        const pid = w.parameter_id as string;
        const from = String(w.valid_from);
        const to = w.valid_to ? String(w.valid_to) : null;
        if (from <= today && (to === null || to >= today)) {
          // Ascending order means the last match wins = the latest version in force.
          currentMap.set(pid, Number(w.weight));
        } else if (from > today && !pendingMap.has(pid)) {
          // First match wins = the soonest scheduled version.
          pendingMap.set(pid, { weight: Number(w.weight), from });
        }
      });

      return (params ?? []).map((p) => {
        const id = p.id as string;
        const currentWeight = currentMap.get(id) ?? 0;
        const pending = pendingMap.get(id) ?? null;
        return {
          id,
          code: p.code as string,
          label_fa: p.label_fa as string,
          is_active: p.is_active as boolean,
          direction: p.direction as string,
          // Edit the value that will actually apply going forward.
          weight: pending ? pending.weight : currentWeight,
          currentWeight,
          pendingWeight: pending ? pending.weight : null,
          pendingFrom: pending ? pending.from : null,
        };
      });
    },
  });

  const [draft, setDraft] = useState<Record<string, { weight: number; is_active: boolean }>>({});

  const update = useMutation({
    mutationFn: async ({
      id,
      weight,
      is_active,
    }: {
      id: string;
      weight: number;
      is_active: boolean;
    }) => {
      const { data, error } = await supabase.rpc(
        "upsert_dynamic_parameter_weight" as never,
        {
          _parameter_id: id,
          _new_weight: weight,
          _new_is_active: is_active,
        } as never,
      );
      if (error) throw error;
      return data as unknown as WeightUpsertResult | null;
    },
    onSuccess: (result) => {
      // Migration 266: a weight change never rewrites the period already in
      // force, so the manager must be told which date it actually applies from
      // — otherwise the change looks like it did nothing.
      const from = result?.effective_from ? isoToJalaliDisplay(result.effective_from) : "";
      if (result?.outcome === "scheduled_next_period" && from) {
        toast.success(
          `وزن جدید ثبت شد و از ${from} اعمال می‌شود (امتیازهای دورهٔ جاری تغییر نمی‌کند)`,
        );
      } else if (result?.outcome === "pending_version_corrected" && from) {
        toast.success(`وزنِ در انتظار اصلاح شد؛ همچنان از ${from} اعمال می‌شود`);
      } else if (result?.outcome === "unchanged") {
        toast.success("قانون به‌روزرسانی شد");
      } else {
        toast.success("قانون به‌روزرسانی شد");
      }
      queryClient.invalidateQueries({ queryKey: ["credit-rules", entityType] });
    },
    onError: (e: unknown) => {
      toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`);
    },
  });

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newWeight, setNewWeight] = useState<number>(0.1);
  const [newDirection, setNewDirection] = useState<"positive" | "negative">("positive");

  const create = useMutation({
    mutationFn: async () => {
      if (!newCode.trim()) throw new Error("کد پارامتر الزامی است");
      if (newWeight < 0 || newWeight > 1) throw new Error("وزن باید بین ۰ و ۱ باشد");
      // v2 takes an explicit entity_type and, unlike the original, writes only
      // columns that still exist on dynamic_scoring_parameters.
      const { error } = await supabase.rpc(
        "create_dynamic_scoring_parameter_v2" as never,
        {
          _entity_type: entityType,
          _code: newCode.trim(),
          _label_fa: newLabel.trim(),
          _weight: newWeight,
          _direction: newDirection,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("پارامتر جدید اضافه شد");
      setNewCode("");
      setNewLabel("");
      setNewWeight(0.1);
      setNewDirection("positive");
      queryClient.invalidateQueries({ queryKey: ["credit-rules", entityType] });
    },
    onError: (e: unknown) => {
      toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`);
    },
  });

  const totalWeight = rules
    .map((r) => ((draft[r.id]?.is_active ?? r.is_active) ? (draft[r.id]?.weight ?? r.weight) : 0))
    .reduce((s, w) => s + Number(w), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="قوانین امتیازدهی"
        description={ENTITY_META[entityType].desc}
        actions={
          <HelpHint
            size={18}
            text={
              "این صفحه برای تنظیم پارامترهای امتیازدهی است.\n" +
              "زبانهٔ «مشتریان» امتیاز مشتری و زبانهٔ «کارشناسان فروش» امتیاز کارشناس را تنظیم می‌کند.\n" +
              "هر پارامتر یک «وزن» بین ۰ تا ۱ دارد؛ مجموع وزن‌های فعال هر زبانه باید ۱.۰۰ شود.\n" +
              "برای فعال/غیرفعال‌کردن از کلید کناری استفاده کنید و سپس روی «ذخیره» بزنید.\n" +
              "تغییر وزن از ابتدای دورهٔ بعد اعمال می‌شود و امتیازهای محاسبه‌شدهٔ دورهٔ جاری را تغییر نمی‌دهد.\n" +
              "تا پیش از رسیدن آن تاریخ می‌توانید همان مقدار را دوباره اصلاح کنید."
            }
          />
        }
      />

      {/* Item 141.2 — customer / salesperson tabs */}
      <Tabs value={entityType} onValueChange={(v) => setEntityType(v as ScoringEntityType)}>
        <TabsList>
          <TabsTrigger value="customer">{ENTITY_META.customer.tab}</TabsTrigger>
          <TabsTrigger value="salesperson">{ENTITY_META.salesperson.tab}</TabsTrigger>
        </TabsList>
      </Tabs>

      {!isLoading && rules.length === 0 && (
        <Alert>
          <AlertDescription>
            {entityType === "salesperson"
              ? "هیچ پارامتر امتیازدهی برای کارشناسان فروش تعریف نشده است؛ تا زمانی که پارامتر و وزن تعریف نشود، امتیاز همهٔ کارشناسان صفر می‌ماند و سرمایه‌ای تخصیص نمی‌یابد."
              : "هیچ پارامتر امتیازدهی برای مشتریان تعریف نشده است."}
          </AlertDescription>
        </Alert>
      )}

      {!canEdit && (
        <Alert>
          <AlertDescription>
            شما فقط دسترسی مشاهده دارید. ویرایش فقط برای مدیر و حسابدار مجاز است.
          </AlertDescription>
        </Alert>
      )}

      {Math.abs(totalWeight - 1) > 0.001 && (
        <Alert variant={totalWeight > 1 ? "destructive" : "default"}>
          <AlertDescription className="flex items-center gap-2">
            <span>مجموع وزن‌های فعال: {totalWeight.toFixed(2)} (مقدار توصیه‌شده: ۱.۰۰)</span>
            <HelpHint
              text={
                "مجموع وزن همهٔ پارامترهای فعال باید برابر ۱.۰۰ باشد تا امتیاز نهایی صفر تا صد به‌درستی محاسبه شود.\n" +
                "اگر بیشتر از ۱ شود امتیاز بیش از حد خوش‌بینانه و اگر کمتر باشد بدبینانه می‌شود."
              }
            />
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">پارامتر</TableHead>
                  <TableHead className="text-right w-32">
                    <span className="inline-flex items-center gap-1">
                      وزن (۰-۱)
                      <HelpHint
                        text={"سهم این پارامتر در امتیاز نهایی.\nمجموع وزن‌های فعال باید ۱.۰۰ شود."}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-24">
                    <span className="inline-flex items-center gap-1">
                      فعال
                      <HelpHint
                        text={"اگر خاموش باشد این پارامتر در محاسبهٔ امتیاز در نظر گرفته نمی‌شود."}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-28">
                    <span className="inline-flex items-center gap-1">
                      جهت
                      <HelpHint
                        text={
                          "positive: مقدار بیشتر امتیاز بیشتر می‌دهد.\nnegative: مقدار بیشتر امتیاز کمتر می‌دهد."
                        }
                      />
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const w = draft[r.id]?.weight ?? r.weight;
                  const a = draft[r.id]?.is_active ?? r.is_active;
                  const dirty =
                    (draft[r.id]?.weight !== undefined && draft[r.id].weight !== r.weight) ||
                    (draft[r.id]?.is_active !== undefined && draft[r.id].is_active !== r.is_active);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.label_fa}</span>
                          <span className="text-[11px] text-muted-foreground">{r.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          dir="ltr"
                          disabled={!canEdit}
                          value={w}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [r.id]: { weight: Number(e.target.value), is_active: a },
                            }))
                          }
                        />
                        {/* 266 — a scheduled change is not yet in force; say so. */}
                        {r.pendingFrom && (
                          <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-500">
                            اکنون {r.currentWeight} · مقدار جدید از{" "}
                            {isoToJalaliDisplay(r.pendingFrom)} اعمال می‌شود
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={a}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            setDraft((d) => ({ ...d, [r.id]: { weight: w, is_active: v } }))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.direction === "negative" ? "negative" : "positive"}
                      </TableCell>
                      <TableCell>
                        {canEdit && dirty && (
                          <Button
                            size="sm"
                            onClick={() => update.mutate({ id: r.id, weight: w, is_active: a })}
                            disabled={update.isPending || w < 0 || w > 1}
                          >
                            <Save className="ml-1 h-4 w-4" /> ذخیره
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold inline-flex items-center gap-2">
              افزودن پارامتر جدید
              <HelpHint
                text={
                  "نام پارامتر را به انگلیسی و کوتاه وارد کنید (مثلاً payment_history).\n" +
                  "وزن باید بین ۰ تا ۱ باشد و در مجموع با سایر پارامترهای فعال برابر ۱.۰۰ شود.\n" +
                  "پارامتر جدید به‌صورت پیش‌فرض «فعال» اضافه می‌شود."
                }
              />
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="inline-flex items-center gap-1">
                  کد پارامتر
                  <HelpHint
                    text={
                      "شناسهٔ انگلیسی پارامتر؛ بدون فاصله، با حروف کوچک و _ مثلاً total_purchases."
                    }
                  />
                </Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="مثلاً profitability"
                />
              </div>
              <div className="space-y-1">
                <Label className="inline-flex items-center gap-1">
                  برچسب فارسی
                  <HelpHint
                    text={
                      "نامی که در پروفایل مشتری نمایش داده می‌شود. اگر خالی باشد از کد استفاده می‌شود."
                    }
                  />
                </Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="مثلاً سودآوری"
                />
              </div>
              <div className="space-y-1">
                <Label className="inline-flex items-center gap-1">
                  وزن (۰ تا ۱)
                  <HelpHint text={"سهم این پارامتر در امتیاز نهایی. مثلاً ۰.۲ یعنی ۲۰٪."} />
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  dir="ltr"
                  value={newWeight}
                  onChange={(e) => setNewWeight(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="inline-flex items-center gap-1">
                  جهت
                  <HelpHint text={"positive: بیشتر = بهتر. negative: بیشتر = بدتر."} />
                </Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={newDirection}
                  onChange={(e) => setNewDirection(e.target.value as "positive" | "negative")}
                >
                  <option value="positive">positive</option>
                  <option value="negative">negative</option>
                </select>
              </div>
              <div className="flex items-end sm:col-span-3">
                <Button
                  type="button"
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !newCode.trim()}
                  className="w-full"
                >
                  <Plus className="ml-1 h-4 w-4" /> افزودن
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
