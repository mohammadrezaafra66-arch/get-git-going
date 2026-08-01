import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Power, Loader2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/accounting/external-parties")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ExternalPartiesPage,
});

type ExternalParty = {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  accounting_code: string | null;
  notes: string | null;
  is_active: boolean;
};

const schema = z.object({
  full_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150),
  national_id: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function ExternalPartiesPage() {
  const { user, roles } = useAuth();
  const canWrite = roles.includes("admin") || roles.includes("accountant");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalParty | null>(null);

  const listQ = useQuery({
    queryKey: ["external-parties", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_parties")
        .select("id, full_name, national_id, phone, accounting_code, notes, is_active")
        .order("is_active", { ascending: false })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExternalParty[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["external-parties"] });

  const toggleActive = useMutation({
    mutationFn: async (r: ExternalParty) => {
      const { error } = await supabase
        .from("external_parties")
        .update({ is_active: !r.is_active })
        .eq("id", r.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null,
        entity_type: "external_party",
        entity_id: r.id,
        action: r.is_active ? "external_party_disabled" : "external_party_enabled",
        diff: { full_name: r.full_name },
      } as never);
    },
    onSuccess: () => {
      toast.success("به‌روزرسانی شد");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="طرف‌های حساب / گیرندگان وجه"
        description="مدیریت طرف‌های حساب خارج از مشتریان برای استفاده در فیش‌های واریزی."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="ml-1 h-4 w-4" /> افزودن طرف حساب
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : (listQ.data ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              طرف حسابی ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">نام</th>
                    <th className="p-3">کد ملی</th>
                    <th className="p-3">موبایل</th>
                    <th className="p-3">کد حسابداری</th>
                    <th className="p-3">وضعیت</th>
                    {canWrite && <th className="p-3">عملیات</th>}
                  </tr>
                </thead>
                <tbody>
                  {(listQ.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.full_name}</td>
                      <td className="p-3" dir="ltr">
                        {r.national_id ?? "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {r.phone ?? "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {r.accounting_code ?? "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </td>
                      {canWrite && (
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditing(r);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleActive.mutate(r)}
                              disabled={toggleActive.isPending}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش طرف حساب" : "افزودن طرف حساب"}</DialogTitle>
          </DialogHeader>
          <ExternalPartyForm
            initial={editing}
            onDone={() => {
              setOpen(false);
              setEditing(null);
              refresh();
            }}
            actorId={user?.id ?? null}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExternalPartyForm({
  initial,
  onDone,
  actorId,
}: {
  initial: ExternalParty | null;
  onDone: () => void;
  actorId: string | null;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      national_id: initial?.national_id ?? "",
      phone: initial?.phone ?? "",
      accounting_code: initial?.accounting_code ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        full_name: v.full_name,
        national_id: v.national_id || null,
        phone: v.phone || null,
        accounting_code: v.accounting_code || null,
        notes: v.notes || null,
      };
      if (initial) {
        const { error } = await supabase
          .from("external_parties")
          .update(payload)
          .eq("id", initial.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: actorId,
          entity_type: "external_party",
          entity_id: initial.id,
          action: "external_party_updated",
          diff: payload,
        } as never);
      } else {
        // Phase 8.5 (Decision 3): creation goes through person_create_inline so
        // the person, the external_parties row and the context link are written
        // in ONE transaction. The previous direct .insert() produced rows with
        // person_id NULL - the same hole Phase 6 closed for suppliers - and
        // migration 242 makes person_id NOT NULL, so it would now simply fail.
        //
        // context_kind is 'accounting_party', which is what the existing data
        // already uses for external parties; there is no separate
        // 'external_party' kind.
        const { data: rpcRes, error } = await supabase.rpc("person_create_inline", {
          p_display_name: v.full_name,
          p_context_kind: "accounting_party",
          p_kind: "individual",
          p_identifiers: v.phone ? [{ kind: "mobile_e164", value_raw: v.phone }] : [],
          p_accounting_code: v.accounting_code || null,
          p_notes: v.notes || null,
          p_legacy_fields: {
            national_id: v.national_id || null,
            phone: v.phone || null,
          },
        });
        if (error) throw error;
        const created = rpcRes as unknown as { legacy_id: string | null } | null;
        if (!created?.legacy_id) throw new Error("ثبت طرف حساب ناموفق بود.");
        await supabase.from("audit_logs").insert({
          actor_id: actorId,
          entity_type: "external_party",
          entity_id: created.legacy_id,
          action: "external_party_created",
          diff: payload,
        } as never);
      }
    },
    onSuccess: () => {
      toast.success("ذخیره شد");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label>
            نام و نام‌خانوادگی <span className="text-destructive">*</span>
          </Label>
          <Input {...form.register("full_name")} />
          {form.formState.errors.full_name && (
            <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>کد ملی</Label>
          <Input dir="ltr" {...form.register("national_id")} />
        </div>
        <div className="space-y-1">
          <Label>شماره موبایل</Label>
          <Input dir="ltr" {...form.register("phone")} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>کد حسابداری</Label>
          <Input dir="ltr" {...form.register("accounting_code")} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>توضیحات</Label>
          <Textarea rows={2} {...form.register("notes")} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ذخیره
        </Button>
      </div>
    </form>
  );
}
