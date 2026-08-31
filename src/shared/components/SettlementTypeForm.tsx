import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

export const settlementTypeSchema = z.object({
  code: z
    .string()
    .min(2, "کد حداقل ۲ کاراکتر")
    .max(40, "کد حداکثر ۴۰ کاراکتر")
    .regex(/^[a-z0-9_]+$/i, "فقط حروف انگلیسی، عدد و _"),
  title: z.string().min(2, "عنوان الزامی است").max(80),
  description: z.string().max(300).optional().nullable(),
  // Settlement deadline in days, counted from the moment the quote is accepted.
  // 0 is meaningful and common -- it is what "cash" means -- so the floor is 0, not 1.
  // The ceiling is a typo guard, not a business limit; the column itself only requires >= 0.
  days: z
    .number({ message: "مهلت تسویه باید عدد باشد" })
    .int("مهلت تسویه باید عدد صحیح باشد")
    .min(0, "مهلت تسویه نمی‌تواند منفی باشد")
    .max(365, "مهلت تسویه حداکثر ۳۶۵ روز"),
  sort_order: z.number().int().min(0).max(99999),
  is_active: z.boolean(),
});

export type SettlementTypeFormValues = z.infer<typeof settlementTypeSchema>;

function generateCode(title: string): string {
  const base = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const ascii = base.length >= 2 ? base : "st";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${ascii}_${suffix}`.slice(0, 40);
}

interface Props {
  initial?: Partial<SettlementTypeFormValues>;
  onSubmit: (values: SettlementTypeFormValues) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  isEdit?: boolean;
}

export function SettlementTypeForm({ initial, onSubmit, onCancel, loading, isEdit }: Props) {
  const [values, setValues] = useState<SettlementTypeFormValues>({
    code: initial?.code ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    days: initial?.days ?? 0,
    sort_order: initial?.sort_order ?? 100,
    is_active: initial?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({
      code: initial?.code ?? "",
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      days: initial?.days ?? 0,
      sort_order: initial?.sort_order ?? 100,
      is_active: initial?.is_active ?? true,
    });
    setErrors({});
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalValues = {
      ...values,
      code: values.code?.trim() || generateCode(values.title),
    };
    const parsed = settlementTypeSchema.safeParse(finalValues);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    await onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div>
        <Label>عنوان *</Label>
        <Input
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder="مثلاً: نقدی"
        />
        {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
      </div>
      {isEdit && (
        <div>
          <Label>کد یکتا</Label>
          <Input dir="ltr" value={values.code} disabled />
          <p className="mt-1 text-[11px] text-muted-foreground">
            کد به‌صورت خودکار تولید شده و قابل ویرایش نیست.
          </p>
        </div>
      )}
      <div>
        <Label>توضیحات</Label>
        <Textarea
          rows={2}
          value={values.description ?? ""}
          onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
        />
      </div>
      <div>
        <Label>مهلت تسویه (روز)</Label>
        <Input
          type="number"
          dir="ltr"
          min={0}
          value={values.days}
          onChange={(e) => setValues((s) => ({ ...s, days: Number(e.target.value) || 0 }))}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          چند روز پس از پذیرش پیش‌فاکتور، مبلغ باید تسویه شود. برای تسویهٔ نقدی صفر بگذارید.
        </p>
        {errors.days && <p className="mt-1 text-xs text-destructive">{errors.days}</p>}
      </div>
      <div>
        <Label>ترتیب نمایش</Label>
        <Input
          type="number"
          dir="ltr"
          value={values.sort_order}
          onChange={(e) => setValues((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">عدد کوچکتر = بالاتر</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={values.is_active}
          onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))}
        />
        <Label>فعال</Label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          انصراف
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
        </Button>
      </div>
    </form>
  );
}
