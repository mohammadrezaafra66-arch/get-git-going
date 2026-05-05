import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchValidationRules,
  type ValidationRule,
  type ValidationScope,
  type ValidationSeverity,
} from "@/lib/validation/rules";

export const Route = createFileRoute("/_app/admin/validation-rules")({
  beforeLoad: async () => { await requireAnyRole(["admin"]); },
  component: ValidationRulesPage,
});

export const SCOPES: { value: ValidationScope; label: string }[] = [
  { value: "receipt", label: "فیش واریزی" },
  { value: "journal_entry", label: "سند حسابداری" },
  { value: "invoice", label: "فاکتور" },
  { value: "purchase", label: "خرید" },
];

function ValidationRulesPage() {
  const [scope, setScope] = useState<ValidationScope>("receipt");
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["validation-rules", scope],
    queryFn: () => fetchValidationRules(scope),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<ValidationRule> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("validation_rules" as never)
        .update(rest as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("قانون به‌روزرسانی شد");
      qc.invalidateQueries({ queryKey: ["validation-rules"] });
    },
    onError: (e) => toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`),
  });

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="استانداردها و قوانین اعتبارسنجی"
        description="ویرایش، فعال/غیرفعال‌سازی و تعیین شدت قوانین اعتبارسنجی برای انواع اسناد."
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Label>نوع سند:</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ValidationScope)}>
              <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">قانونی برای این نوع سند تعریف نشده است.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فیلد</TableHead>
                  <TableHead>نوع قانون</TableHead>
                  <TableHead>فعال</TableHead>
                  <TableHead>شدت</TableHead>
                  <TableHead>متن هشدار</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <RuleRow key={r.id} rule={r} onSave={(patch) => updateMut.mutate({ id: r.id, ...patch })} saving={updateMut.isPending} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ rule, onSave, saving }: {
  rule: ValidationRule;
  onSave: (patch: Partial<ValidationRule>) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [severity, setSeverity] = useState<ValidationSeverity>(rule.severity);
  const [message, setMessage] = useState(rule.message);
  const dirty = enabled !== rule.enabled || severity !== rule.severity || message !== rule.message;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs" dir="ltr">{rule.field_key}</TableCell>
      <TableCell className="text-xs">
        {rule.rule_type === "required" ? "اجباری" : "کد آسان معتبر"}
      </TableCell>
      <TableCell><Switch checked={enabled} onCheckedChange={setEnabled} /></TableCell>
      <TableCell>
        <Select value={severity} onValueChange={(v) => setSeverity(v as ValidationSeverity)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warning">هشدار (قابل عبور)</SelectItem>
            <SelectItem value="blocking">مسدودکننده</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          className="min-w-[260px]"
        />
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() => onSave({ enabled, severity, message })}
        >
          ذخیره
        </Button>
      </TableCell>
    </TableRow>
  );
}