import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
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
    .min(1, "کد آسان الزامی است")
    .regex(accountingCodeRegex, "کد آسان نامعتبر (حروف انگلیسی/اعداد/_/-، حداکثر ۳۰)"),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

type Values = z.infer<typeof schema>;

export interface QuickAddCustomerResult {
  id: string;
  name: string;
  phone: string;
  accounting_code: string;
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
        accounting_code: v.accounting_code.trim(),
        city: v.city?.trim() || null,
        notes: v.notes?.trim() || null,
      };
      const { data, error } = await supabase
        .from("customers")
        .insert(payload as never)
        .select("id, name, phone, accounting_code")
        .single();
      if (error) throw error;
      return data as QuickAddCustomerResult;
    },
    onSuccess: (c) => {
      toast.success(`شخص «${c.name}» با موفقیت ثبت شد`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onCreated?.(c);
      form.reset();
      setOpen(false);
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : "خطای ناشناخته";
      const msg =
        /accounting_code/i.test(raw) || /duplicate key/i.test(raw)
          ? "کد آسان تکراری یا قالب نامعتبر دارد"
          : raw;
      toast.error(`ثبت ناموفق بود: ${msg}`);
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) form.reset(); }}>
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

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="qa-name">نام شخص <span className="text-destructive">*</span></Label>
            <Input id="qa-name" {...form.register("name")} placeholder="نام و نام خانوادگی" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-phone">شماره موبایل <span className="text-destructive">*</span></Label>
            <Input
              id="qa-phone"
              dir="ltr"
              inputMode="numeric"
              maxLength={11}
              placeholder="09xxxxxxxxx"
              {...form.register("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-code">کد آسان <span className="text-destructive">*</span></Label>
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
            <p className="text-[11px] text-muted-foreground">یکتا، فقط حروف انگلیسی/اعداد/_/-</p>
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