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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/accounting/bank-accounts")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: BankAccountsPage,
});

type BankAccount = {
  id: string;
  title: string;
  bank_name: string;
  iban: string | null;
  account_no: string | null;
  card_no: string | null;
  currency: string;
  account_type: "bank" | "cash";
  opening_balance: number;
  is_active: boolean;
  notes: string | null;
  accounting_code: string | null;
};

const schema = z.object({
  title: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150),
  bank_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(100),
  iban: z.string().trim().max(50).optional().or(z.literal("")),
  account_no: z.string().trim().max(50).optional().or(z.literal("")),
  card_no: z.string().trim().max(50).optional().or(z.literal("")),
  currency: z.string().trim().min(2).max(10),
  // Item 181 — cash box vs bank account (migration 212).
  account_type: z.enum(["bank", "cash"]),
  opening_balance: z.number(),
  // Same shape as external_parties.accounting_code: optional, max 50.
  accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function BankAccountsPage() {
  const { user, roles } = useAuth();
  const canWrite = roles.includes("admin") || roles.includes("accountant");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  const listQ = useQuery({
    queryKey: ["bank-accounts", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select(
          "id, title, bank_name, iban, account_no, card_no, currency, account_type, opening_balance, is_active, notes, accounting_code",
        )
        .order("is_active", { ascending: false })
        .order("title", { ascending: true });
      if (error) throw error;
      // Cast through unknown: the generated types.ts predates
      // bank_accounts.accounting_code and cannot be regenerated here (the
      // Supabase CLI is not installed, and types.ts must not be hand-edited).
      // Same workaround the quote_id / customer_id columns already use.
      return (data ?? []) as unknown as BankAccount[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["bank-accounts"] });

  const toggleActive = useMutation({
    mutationFn: async (r: BankAccount) => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_active: !r.is_active })
        .eq("id", r.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null,
        entity_type: "bank_account",
        entity_id: r.id,
        action: r.is_active ? "bank_account_disabled" : "bank_account_enabled",
        diff: { title: r.title },
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
        title="حساب‌های بانکی"
        description="مدیریت حساب‌های بانکی برای استفاده در فیش‌های واریزی."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="ml-1 h-4 w-4" /> افزودن حساب
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
              حسابی ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">عنوان</th>
                    <th className="p-3">بانک</th>
                    <th className="p-3">شماره حساب</th>
                    <th className="p-3">شماره کارت</th>
                    <th className="p-3">شبا</th>
                    <th className="p-3">کد حسابداری</th>
                    <th className="p-3">ارز</th>
                    <th className="p-3">نوع</th>
                    <th className="p-3">وضعیت</th>
                    {canWrite && <th className="p-3">عملیات</th>}
                  </tr>
                </thead>
                <tbody>
                  {(listQ.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.title}</td>
                      <td className="p-3">{r.bank_name}</td>
                      <td className="p-3" dir="ltr">
                        {r.account_no ?? "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {r.card_no ?? "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {r.iban ?? "—"}
                      </td>
                      <AsanCodeCell
                        row={r}
                        canWrite={canWrite}
                        actorId={user?.id ?? null}
                        onSaved={refresh}
                      />
                      <td className="p-3">{r.currency}</td>
                      <td className="p-3">
                        <Badge variant={r.account_type === "cash" ? "default" : "outline"}>
                          {r.account_type === "cash" ? "صندوق نقدی" : "حساب بانکی"}
                        </Badge>
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
            <DialogTitle>{editing ? "ویرایش حساب بانکی" : "افزودن حساب بانکی"}</DialogTitle>
          </DialogHeader>
          <BankAccountForm
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

/**
 * The Asan code cell, editable in place.
 *
 * WHY IN PLACE AND NOT THROUGH THE DIALOG. The dialog already edits this field and keeps working
 * — it is the right tool for one account. But the owner has twenty accounts to code, and the
 * dialog costs an open, a scroll past six unrelated fields, a save and a close for each one.
 * Editing in the cell is click, type, Enter, next row.
 *
 * WHY ONLY THIS COLUMN. Every other field on this table is either identifying (title, bank_name)
 * or money-shaped (opening_balance, currency), and a stray keystroke on those is expensive. The
 * Asan code is the only one being entered twenty times in a sitting, so it is the only one that
 * earns the risk.
 *
 * The empty string is written as NULL, matching the dialog exactly: `post_receipt_accounting`
 * treats a blank code as "not set", and storing "" would pass a not-blank check while meaning
 * nothing. `bank_accounts.accounting_code` also carries a unique-when-not-null index, so the
 * duplicate case is a real one an owner will hit while typing twenty codes — it is named in
 * Persian rather than surfaced as a raw Postgres error.
 */
function AsanCodeCell({
  row,
  canWrite,
  actorId,
  onSaved,
}: {
  row: BankAccount;
  canWrite: boolean;
  actorId: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.accounting_code ?? "");

  const save = useMutation({
    mutationFn: async (next: string) => {
      const code = next.trim() || null;
      const { error } = await supabase
        .from("bank_accounts")
        // `as never` for the same stale-types reason as the dialog: types.ts predates this column.
        .update({ accounting_code: code } as never)
        .eq("id", row.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: actorId,
        entity_type: "bank_account",
        entity_id: row.id,
        action: "bank_account_asan_code_updated",
        diff: { from: row.accounting_code, to: code },
      } as never);
    },
    onSuccess: () => {
      setEditing(false);
      toast.success("کد ذخیره شد");
      onSaved();
    },
    onError: (e: any) => {
      // 23505 is the unique-when-not-null index. Two accounts cannot share one Asan code.
      const duplicate = e?.code === "23505" || String(e?.message ?? "").includes("23505");
      toast.error(duplicate ? "این کد قبلاً برای حساب دیگری ثبت شده است." : (e?.message ?? "خطا"));
    },
  });

  const commit = () => {
    if (value.trim() === (row.accounting_code ?? "")) {
      setEditing(false);
      return;
    }
    save.mutate(value);
  };

  const cancel = () => {
    setValue(row.accounting_code ?? "");
    setEditing(false);
  };

  if (!canWrite) {
    return (
      <td className="p-3" dir="ltr">
        {row.accounting_code ?? "—"}
      </td>
    );
  }

  return (
    <td className="p-3" dir="ltr">
      {editing ? (
        <Input
          autoFocus
          dir="ltr"
          className="h-8 w-28"
          maxLength={50}
          value={value}
          disabled={save.isPending}
          aria-label={`کد آسان حساب ${row.title}`}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-16 rounded px-1 text-right hover:bg-muted"
          aria-label={`ویرایش کد آسان حساب ${row.title}`}
          onClick={() => {
            setValue(row.accounting_code ?? "");
            setEditing(true);
          }}
        >
          {row.accounting_code ?? "—"}
        </button>
      )}
    </td>
  );
}

function BankAccountForm({
  initial,
  onDone,
  actorId,
}: {
  initial: BankAccount | null;
  onDone: () => void;
  actorId: string | null;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      bank_name: initial?.bank_name ?? "",
      iban: initial?.iban ?? "",
      account_no: initial?.account_no ?? "",
      card_no: initial?.card_no ?? "",
      currency: initial?.currency ?? "IRR",
      account_type: initial?.account_type ?? "bank",
      opening_balance: Number(initial?.opening_balance ?? 0),
      accounting_code: initial?.accounting_code ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        title: v.title,
        bank_name: v.bank_name,
        iban: v.iban || null,
        account_no: v.account_no || null,
        card_no: v.card_no || null,
        currency: v.currency || "IRR",
        account_type: v.account_type,
        opening_balance: Number(v.opening_balance) || 0,
        // Empty string -> NULL, so a cleared field really clears the code
        // instead of storing "" and passing the not-blank check in
        // post_receipt_accounting.
        accounting_code: v.accounting_code || null,
        notes: v.notes || null,
      };
      if (initial) {
        // `as never` for the same stale-types reason as the insert below.
        const { error } = await supabase
          .from("bank_accounts")
          .update(payload as never)
          .eq("id", initial.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: actorId,
          entity_type: "bank_account",
          entity_id: initial.id,
          action: "bank_account_updated",
          diff: payload,
        } as never);
      } else {
        const { data, error } = await supabase
          .from("bank_accounts")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: actorId,
          entity_type: "bank_account",
          entity_id: (data as { id: string }).id,
          action: "bank_account_created",
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
        <div className="space-y-1">
          <Label>
            عنوان <span className="text-destructive">*</span>
          </Label>
          <Input {...form.register("title")} />
          {form.formState.errors.title && (
            <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>
            نام بانک <span className="text-destructive">*</span>
          </Label>
          <Input {...form.register("bank_name")} />
          {form.formState.errors.bank_name && (
            <p className="text-xs text-destructive">{form.formState.errors.bank_name.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>شماره حساب</Label>
          <Input dir="ltr" {...form.register("account_no")} />
        </div>
        <div className="space-y-1">
          <Label>شماره کارت</Label>
          <Input dir="ltr" {...form.register("card_no")} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>شبا (IBAN)</Label>
          <Input dir="ltr" {...form.register("iban")} />
        </div>
        <div className="space-y-1">
          <Label>ارز</Label>
          <Input dir="ltr" {...form.register("currency")} />
        </div>
        {/* Item 181 — distinguishes a cash box from a bank account. */}
        <div className="space-y-1">
          <Label>نوع حساب</Label>
          <Select
            value={form.watch("account_type")}
            onValueChange={(v) =>
              form.setValue("account_type", v as "bank" | "cash", { shouldDirty: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">حساب بانکی</SelectItem>
              <SelectItem value="cash">صندوق نقدی</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>مانده افتتاحیه</Label>
          <Input type="number" {...form.register("opening_balance", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>کد حسابداری</Label>
          <Input dir="ltr" {...form.register("accounting_code")} />
          <p className="text-xs text-muted-foreground">
            بدون این کد، فیش واریزی که این حساب را به‌عنوان دریافت‌کننده دارد قابل ثبت سند حسابداری
            نیست.
          </p>
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
