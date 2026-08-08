import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { ExistingPersonPrompt } from "@/components/persons/ExistingPersonPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const phoneRegex = /^09\d{9}$/;
const accountingCodeRegex = /^[A-Za-z0-9_-]{1,30}$/;

const schema = z.object({
  name: z.string().trim().min(2, "نام حداقل ۲ کاراکتر").max(100),
  phone: z
    .string()
    .trim()
    .min(1, "شماره موبایل الزامی است")
    .regex(phoneRegex, "شماره موبایل نامعتبر است (۰۹xxxxxxxxx)"),
  accounting_code: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || accountingCodeRegex.test(v),
      "کد آسان نامعتبر (حروف انگلیسی/اعداد/_/-، حداکثر ۳۰)",
    ),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

type Values = z.infer<typeof schema>;

export interface QuickAddCustomerResult {
  id: string;
  name: string;
  phone: string;
  accounting_code: string | null;
}

interface Props {
  trigger?: ReactNode;
  onCreated?: (c: QuickAddCustomerResult) => void;
  buttonLabel?: string;
  buttonSize?: "sm" | "default" | "lg";
  buttonVariant?: "default" | "outline" | "secondary";
}

/**
 * دیالوگ معرفی سریع شخص جدید به سیستم.
 * نام، شماره موبایل و کد آسان (accounting_code) اجباری هستند.
 * بعد از ثبت، شخص در جدول مشتریان قابل استفاده برای فیش، فاکتور، پیش‌فاکتور و خرید است.
 */
export function QuickAddCustomerDialog({
  trigger,
  onCreated,
  buttonLabel = "معرفی شخص جدید",
  buttonSize = "sm",
  buttonVariant = "outline",
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", accounting_code: "", city: "", notes: "" },
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: async (v: Values) => {
      const payload = {
        name: v.name.trim(),
        phone: v.phone.trim(),
        accounting_code: v.accounting_code?.trim() || null,
        city: v.city?.trim() || null,
        notes: v.notes?.trim() || null,
      };
      // Mirror CustomerForm: explicitly attach bearer token at call site to
      // avoid hydration/timing races with the global attachSupabaseAuth middleware.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
      }
      // Item 229 — this used to INSERT straight into `customers`, which was one
      // of four uncoordinated customer write paths and produced rows with no
      // person record behind them. It now goes through person_create_inline,
      // which creates the person, its normalized identifiers, the `customers`
      // mirror row and a provenance link in ONE transaction.
      //
      // The returned `id` is deliberately the CUSTOMERS id, not the person id:
      // callers assign it to sales_quotes.customer_id, which still FKs to
      // `customers`. Changing that is the FK-transition phase, not this one.
      const { data, error } = await supabase.rpc("person_create_inline", {
        p_display_name: payload.name,
        p_context_kind: "customer",
        p_kind: "individual",
        p_identifiers: [{ kind: "mobile_e164", value_raw: payload.phone, is_primary: true }],
        p_city: payload.city,
        p_notes: payload.notes,
        p_accounting_code: payload.accounting_code,
      });

      if (error) {
        throw error;
      }
      const row = data as { legacy_id: string | null } | null;
      if (!row?.legacy_id) {
        throw new Error("ایجاد مشتری ناموفق بود — رکوردی بازگردانده نشد");
      }

      return {
        id: row.legacy_id,
        name: payload.name,
        phone: payload.phone,
        accounting_code: payload.accounting_code ?? null,
      } satisfies QuickAddCustomerResult;
    },
    onSuccess: (c) => {
      toast.success(`شخص «${c.name}» با موفقیت ثبت شد`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "search"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-form-customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales-quote-customer-search"] });
      onCreated?.(c);
      form.reset();
      setOpen(false);
    },
    onError: (err: unknown) => {
      // createCustomer serverFn already maps duplicate accounting_code and
      // RLS errors to Persian messages via mapPgError/toServerError.
      const raw = err instanceof Error ? err.message : "";
      const lower = raw.toLowerCase();

      // Network / fetch failures (offline, server unreachable)
      if (
        err instanceof TypeError ||
        lower.includes("failed to fetch") ||
        lower.includes("networkerror") ||
        lower.includes("load failed")
      ) {
        toast.error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
        return;
      }

      // Duplicate accounting code → highlight the field too
      if (
        raw.includes("کد حسابداری تکراری") ||
        lower.includes("accounting_code") ||
        lower.includes("duplicate key")
      ) {
        form.setError("accounting_code", { message: "کد آسان تکراری است" });
        toast.error("کد آسان تکراری است؛ یک کد یکتای دیگر انتخاب کنید.");
        return;
      }

      // Session expired
      if (raw.includes("نشست کاربری") || lower.includes("unauthorized") || lower.includes("401")) {
        toast.error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
        return;
      }

      // RLS / permission
      if (
        raw.includes("دسترسی") ||
        lower.includes("forbidden") ||
        lower.includes("403") ||
        lower.includes("rls")
      ) {
        toast.error("دسترسی لازم برای ثبت شخص جدید را ندارید.");
        return;
      }

      // Validation (zod-style) — surface the message itself
      toast.error(raw ? `ثبت ناموفق بود: ${raw}` : "ثبت ناموفق بود. لطفاً دوباره تلاش کنید.");
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) form.reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size={buttonSize} variant={buttonVariant}>
            <UserPlus className="ml-1 h-4 w-4" />
            {buttonLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>معرفی شخص جدید</DialogTitle>
          <DialogDescription>
            بعد از ثبت، می‌توانید برای این شخص فیش، پرداخت، پیش‌فاکتور و خرید ثبت کنید.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-name">
              نام شخص <span className="text-destructive">*</span>
            </Label>
            <Input id="qa-name" {...form.register("name")} placeholder="نام و نام خانوادگی" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-phone">
              شماره موبایل <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qa-phone"
              dir="ltr"
              inputMode="numeric"
              maxLength={11}
              placeholder="09xxxxxxxxx"
              {...form.register("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            {/* P1.2 — this dialog exists to pick someone to bill. If the number
                is already on file, hand back that customer instead of failing
                on the identifier uniqueness rule. */}
            <ExistingPersonPrompt
              phone={form.watch("phone")}
              targetRole="customer"
              onUseExisting={async (customerId) => {
                const { data } = await supabase
                  .from("customers")
                  .select("id, name, phone, accounting_code")
                  .eq("id", customerId)
                  .maybeSingle();
                const row = data as unknown as QuickAddCustomerResult | null;
                if (!row) {
                  toast.error("رکورد این شخص قابل خواندن نیست.");
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["customers"] });
                queryClient.invalidateQueries({ queryKey: ["customers", "search"] });
                queryClient.invalidateQueries({ queryKey: ["invoice-form-customers"] });
                queryClient.invalidateQueries({ queryKey: ["sales-quote-customer-search"] });
                onCreated?.(row);
                form.reset();
                setOpen(false);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-code">کد آسان</Label>
            <Input
              id="qa-code"
              dir="ltr"
              maxLength={30}
              placeholder="مثلاً CUST-1024"
              {...form.register("accounting_code")}
            />
            {errors.accounting_code && (
              <p className="text-xs text-destructive">{errors.accounting_code.message}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              اختیاری، یکتا، فقط حروف انگلیسی/اعداد/_/-
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-city">شهر (اختیاری)</Label>
            <Input id="qa-city" {...form.register("city")} placeholder="مثلاً تهران" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-notes">توضیحات (اختیاری)</Label>
            <Textarea id="qa-notes" rows={2} maxLength={500} {...form.register("notes")} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت شخص
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
