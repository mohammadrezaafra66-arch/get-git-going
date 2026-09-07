/**
 * Wave 6 B-4 — «فیلدهای سفارشی اشخاص», the admin screen for `person_field_definitions`.
 *
 * The server side of this feature was already finished: both tables, RLS, validation triggers,
 * audit triggers and the whole `getPerson`/`updatePerson`/`createPerson` function layer. What
 * was missing was any UI at all — `grep -rln "person_field" src/` matched only two `.ts` files
 * and not one `.tsx`. This route adds ZERO backend: every column it writes was verified to
 * exist first.
 *
 * ## The gate
 *
 * `staticData.gate` AND `beforeLoad`, both naming `["admin","manager"]` — which is exactly what
 * the live policies allow: `pfd_insert_admin_manager` and `pfd_update_admin_manager` are both
 * `has_any_role(auth.uid(), ARRAY['admin','manager'])`. `beforeLoad` runs only on the server,
 * so `staticData.gate` is what `RouteRoleGate` enforces on a cold client navigation. A route
 * with only one of the two is the security-wave-2 defect.
 *
 * ## Seven field types, and boolean is 'bool'
 *
 * The live CHECK allows text, number, date, bool, select, multiselect and jsonb — seven, not
 * five — and `applies_to_kind` allows individual, organization, both. This screen offers
 * exactly those, from the shared constants in `lib/persons/field-definitions`, so the form can
 * never propose a value the CHECK would reject.
 *
 * ## Deactivate, never delete
 *
 * There is no delete control. A definition with values attached is referenced history, and
 * `is_active = false` already hides it from the profile form while leaving what people already
 * recorded intact and readable.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  PERSON_FIELD_KINDS,
  PERSON_FIELD_KIND_FA,
  PERSON_FIELD_TYPES,
  PERSON_FIELD_TYPE_FA,
  createPersonFieldDefinition,
  listPersonFieldDefinitions,
  updatePersonFieldDefinition,
  type PersonFieldDefinition,
  type PersonFieldKind,
  type PersonFieldType,
} from "@/lib/persons/field-definitions";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/admin/person-fields")({
  // Mirrors requireAnyRole below, and mirrors pfd_insert_admin_manager / pfd_update_admin_manager.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PersonFieldsAdminPage,
});

const NEEDS_OPTIONS: PersonFieldType[] = ["select", "multiselect"];

function PersonFieldsAdminPage() {
  const { roles, permissionsLoading } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<PersonFieldType>("text");
  const [appliesTo, setAppliesTo] = useState<PersonFieldKind>("both");
  const [isRequired, setIsRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState("100");
  const [helpText, setHelpText] = useState("");
  const [optionsText, setOptionsText] = useState("");

  const canManage = hasPermissionEx(roles, "persons", "update");

  const defsQuery = useQuery({
    queryKey: ["person-field-definitions"],
    queryFn: listPersonFieldDefinitions,
  });

  const createMutation = useMutation({
    mutationFn: createPersonFieldDefinition,
    onSuccess: () => {
      toast.success("فیلد جدید تعریف شد");
      setName("");
      setLabel("");
      setHelpText("");
      setOptionsText("");
      setIsRequired(false);
      void queryClient.invalidateQueries({ queryKey: ["person-field-definitions"] });
    },
    onError: (e: Error) => toast.error("تعریف فیلد ناموفق بود", { description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      updatePersonFieldDefinition(v.id, { is_active: v.is_active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["person-field-definitions"] });
    },
    onError: (e: Error) => toast.error("تغییر وضعیت ناموفق بود", { description: e.message }),
  });

  // X-3: with the static matrix gone, hasPermissionEx answers false while role_permissions is
  // in flight. Hold rather than draw a refusal that may be wrong.
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>در حال بررسی دسترسی…</span>
      </div>
    );
  }

  const needsOptions = NEEDS_OPTIONS.includes(fieldType);
  const parsedOptions = optionsText
    .split(/[\n,،]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const canSubmit =
    canManage &&
    name.trim().length > 0 &&
    label.trim().length > 0 &&
    (!needsOptions || parsedOptions.length > 0);

  const rows = defsQuery.data ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="فیلدهای سفارشی اشخاص"
        description="تعریف فیلدهای اختصاصی که در پروفایل اشخاص نمایش داده و پر می‌شوند"
      />

      {canManage && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-base font-semibold">تعریف فیلد جدید</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pf-name">نام سیستمی (انگلیسی)</Label>
                <Input
                  id="pf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="national_id"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-label">عنوان نمایشی</Label>
                <Input
                  id="pf-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="کد ملی"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-type">نوع فیلد</Label>
                <Select value={fieldType} onValueChange={(v) => setFieldType(v as PersonFieldType)}>
                  <SelectTrigger id="pf-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PERSON_FIELD_TYPE_FA[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-kind">مربوط به</Label>
                <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as PersonFieldKind)}>
                  <SelectTrigger id="pf-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_FIELD_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {PERSON_FIELD_KIND_FA[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-sort">ترتیب نمایش</Label>
                <Input
                  id="pf-sort"
                  inputMode="numeric"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-help">راهنما</Label>
                <Input
                  id="pf-help"
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                  placeholder="اختیاری"
                />
              </div>
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <Label htmlFor="pf-options">
                  گزینه‌ها (هر گزینه در یک خط یا جدا شده با ویرگول)
                </Label>
                <Input
                  id="pf-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="طلایی، نقره‌ای، برنزی"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch id="pf-required" checked={isRequired} onCheckedChange={setIsRequired} />
              <Label htmlFor="pf-required">پر کردن این فیلد اجباری است</Label>
            </div>

            <Button
              onClick={() =>
                createMutation.mutate({
                  name: name.trim(),
                  label: label.trim(),
                  field_type: fieldType,
                  applies_to_kind: appliesTo,
                  is_required: isRequired,
                  is_active: true,
                  sort_order: Number(sortOrder) || 100,
                  help_text: helpText.trim() || null,
                  validation_regex: null,
                  options: needsOptions ? parsedOptions : null,
                })
              }
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="ml-2 h-4 w-4" />
              )}
              تعریف فیلد
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-base font-semibold">فیلدهای تعریف‌شده</h2>
          {defsQuery.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : defsQuery.isError ? (
            <p className="p-6 text-sm text-destructive">
              خطا در بارگذاری: {(defsQuery.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">هنوز فیلدی تعریف نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="p-2 font-medium">عنوان</th>
                    <th className="p-2 font-medium">نام سیستمی</th>
                    <th className="p-2 font-medium">نوع</th>
                    <th className="p-2 font-medium">مربوط به</th>
                    <th className="p-2 font-medium">اجباری</th>
                    <th className="p-2 font-medium">ترتیب</th>
                    <th className="p-2 font-medium">فعال</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d: PersonFieldDefinition) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-2">{d.label}</td>
                      <td className="p-2" dir="ltr">
                        {d.name}
                      </td>
                      <td className="p-2">{PERSON_FIELD_TYPE_FA[d.field_type] ?? d.field_type}</td>
                      <td className="p-2">
                        {PERSON_FIELD_KIND_FA[d.applies_to_kind] ?? d.applies_to_kind}
                      </td>
                      <td className="p-2">
                        {d.is_required ? <Badge variant="secondary">اجباری</Badge> : "—"}
                      </td>
                      <td className="p-2">{toFaDigits(String(d.sort_order))}</td>
                      <td className="p-2">
                        <Switch
                          checked={d.is_active}
                          disabled={!canManage || toggleMutation.isPending}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: d.id, is_active: v })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            فیلدها حذف نمی‌شوند؛ غیرفعال کردن، فیلد را از فرم پروفایل پنهان می‌کند و مقادیر ثبت‌شده
            دست‌نخورده باقی می‌ماند.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
