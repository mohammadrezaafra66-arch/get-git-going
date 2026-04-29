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
  sort_order: z.number().int().min(0).max(99999),
  is_active: z.boolean(),
});

export type SettlementTypeFormValues = z.infer<typeof settlementTypeSchema>;

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
    sort_order: initial?.sort_order ?? 100,
    is_active: initial?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({
      code: initial?.code ?? "",
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      sort_order: initial?.sort_order ?? 100,
      is_active: initial?.is_active ?? true,
    });
    setErrors({});
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = settlementTypeSchema.safeParse(values);
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
      <div>
        <Label>کد یکتا *</Label>
        <Input
          dir="ltr"
          value={values.code}
          onChange={(e) => setValues((s) => ({ ...s, code: e.target.value }))}
          placeholder="cash"
          disabled={isEdit}
        />
        {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
        {isEdit && <p className="mt-1 text-[11px] text-muted-foreground">کد پس از ثبت قابل ویرایش نیست.</p>}
      </div>
      <div>
        <Label>توضیحات</Label>
        <Textarea
          rows={2}
          value={values.description ?? ""}
          onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
        />
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