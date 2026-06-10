import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { requireAnyRole } from "@/lib/rbac/route-guards";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/sales/credit-rules")({
  beforeLoad: async () => { await requireAnyRole(["admin", "accountant"]); },
  component: CreditRulesPage,
});

interface Rule {
  id: string;
  parameter_name: string;
  weight: number;
  is_active: boolean;
  score_formula: string | null;
}

function CreditRulesPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasAnyRole(roles, ["admin", "accountant"]);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["credit-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_scoring_rules")
        .select("id, parameter_name, weight, is_active, score_formula")
        .order("parameter_name");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const [draft, setDraft] = useState<Record<string, { weight: number; is_active: boolean }>>({});

  const update = useMutation({
    mutationFn: async ({ id, weight, is_active }: { id: string; weight: number; is_active: boolean }) => {
      const { error } = await supabase
        .from("credit_scoring_rules")
        .update({ weight, is_active } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("قانون به‌روزرسانی شد");
      queryClient.invalidateQueries({ queryKey: ["credit-rules"] });
    },
    onError: (e: unknown) => {
      toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`);
    },
  });

  const [newName, setNewName] = useState("");
  const [newWeight, setNewWeight] = useState<number>(0.1);

  const create = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("نام پارامتر الزامی است");
      if (newWeight < 0 || newWeight > 1) throw new Error("وزن باید بین ۰ و ۱ باشد");
      const { error } = await supabase.from("credit_scoring_rules").insert({
        parameter_name: newName.trim(),
        weight: newWeight,
        is_active: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("پارامتر جدید اضافه شد");
      setNewName(""); setNewWeight(0.1);
      queryClient.invalidateQueries({ queryKey: ["credit-rules"] });
    },
    onError: (e: unknown) => {
      toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`);
    },
  });

  const totalWeight = rules
    .map((r) => (draft[r.id]?.is_active ?? r.is_active) ? (draft[r.id]?.weight ?? r.weight) : 0)
    .reduce((s, w) => s + Number(w), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="قوانین امتیازدهی اعتباری"
        description="مدیریت پارامترها و وزن‌های محاسبه امتیاز اعتباری مشتری"
        actions={
          <HelpHint
            size={18}
            text={
              "این صفحه برای تنظیم پارامترهای محاسبه امتیاز اعتباری مشتری است.\n" +
              "هر پارامتر یک «وزن» بین ۰ تا ۱ دارد؛ مجموع وزن‌های فعال باید ۱.۰۰ شود.\n" +
              "برای فعال/غیرفعال‌کردن از کلید کناری استفاده کنید و سپس روی «ذخیره» بزنید.\n" +
              "می‌توانید پارامترهای جدید با نام انگلیسی (مثلاً profitability) اضافه کنید."
            }
          />
        }
      />

      {!canEdit && (
        <Alert>
          <AlertDescription>شما فقط دسترسی مشاهده دارید. ویرایش فقط برای مدیر و حسابدار مجاز است.</AlertDescription>
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
                  <TableHead className="text-right">نام پارامتر</TableHead>
                  <TableHead className="text-right w-32">
                    <span className="inline-flex items-center gap-1">
                      وزن (۰-۱)
                      <HelpHint text={"سهم این پارامتر در امتیاز نهایی.\nمجموع وزن‌های فعال باید ۱.۰۰ شود."} />
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-24">
                    <span className="inline-flex items-center gap-1">
                      فعال
                      <HelpHint text={"اگر خاموش باشد این پارامتر در محاسبهٔ امتیاز در نظر گرفته نمی‌شود."} />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      فرمول
                      <HelpHint text={"فرمول داخلی محاسبهٔ این پارامتر (فقط نمایشی).\nبرای تغییر منطق با مدیر سیستم هماهنگ کنید."} />
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const w = draft[r.id]?.weight ?? r.weight;
                  const a = draft[r.id]?.is_active ?? r.is_active;
                  const dirty = (draft[r.id]?.weight !== undefined && draft[r.id].weight !== r.weight)
                    || (draft[r.id]?.is_active !== undefined && draft[r.id].is_active !== r.is_active);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.parameter_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number" min="0" max="1" step="0.05" dir="ltr"
                          disabled={!canEdit}
                          value={w}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [r.id]: { weight: Number(e.target.value), is_active: a } }))
                          }
                        />
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
                      <TableCell className="text-xs text-muted-foreground">{r.score_formula ?? "—"}</TableCell>
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
                  نام پارامتر
                  <HelpHint text={"شناسهٔ انگلیسی پارامتر؛ بدون فاصله، با حروف کوچک و _ مثلاً total_purchases."} />
                </Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلاً profitability" />
              </div>
              <div className="space-y-1">
                <Label className="inline-flex items-center gap-1">
                  وزن (۰ تا ۱)
                  <HelpHint text={"سهم این پارامتر در امتیاز نهایی. مثلاً ۰.۲ یعنی ۲۰٪."} />
                </Label>
                <Input
                  type="number" min="0" max="1" step="0.05" dir="ltr"
                  value={newWeight}
                  onChange={(e) => setNewWeight(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
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