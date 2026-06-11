import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_ACCESS_LEVELS,
  type KnowledgeCategory,
  type KnowledgeAccessLevel,
} from "@/lib/knowledge/constants";

const schema = z.object({
  title: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(200, "حداکثر ۲۰۰ کاراکتر"),
  content: z.string().trim().min(10, "محتوا حداقل ۱۰ کاراکتر"),
  category: z.enum([
    "sales_rules",
    "purchase_rules",
    "accounting",
    "warehouse",
    "product_training",
    "circulars",
    "general",
  ]),
  access_level: z.enum(["all", "manager_only", "finance_only", "admin_only"]),
  is_published: z.boolean(),
});

export type KnowledgeFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<KnowledgeFormValues>;
  onSubmit: (values: KnowledgeFormValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

export function KnowledgeDocumentForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "ذخیره",
  onCancel,
}: Props) {
  const form = useForm<KnowledgeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      content: defaultValues?.content ?? "",
      category: (defaultValues?.category as KnowledgeCategory) ?? "general",
      access_level: (defaultValues?.access_level as KnowledgeAccessLevel) ?? "all",
      is_published: defaultValues?.is_published ?? false,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        title: defaultValues.title ?? "",
        content: defaultValues.content ?? "",
        category: (defaultValues.category as KnowledgeCategory) ?? "general",
        access_level: (defaultValues.access_level as KnowledgeAccessLevel) ?? "all",
        is_published: defaultValues.is_published ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    defaultValues?.title,
    defaultValues?.content,
    defaultValues?.category,
    defaultValues?.access_level,
    defaultValues?.is_published,
  ]);

  return (
    <form
      dir="rtl"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        await onSubmit(v);
      })}
    >
      <div className="space-y-1.5">
        <Label>عنوان</Label>
        <Input {...form.register("title")} placeholder="مثلاً: قوانین تخفیف فروش" maxLength={200} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>دسته‌بندی</Label>
          <Select
            value={form.watch("category")}
            onValueChange={(v) =>
              form.setValue("category", v as KnowledgeCategory, { shouldDirty: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>سطح دسترسی</Label>
          <Select
            value={form.watch("access_level")}
            onValueChange={(v) =>
              form.setValue("access_level", v as KnowledgeAccessLevel, { shouldDirty: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWLEDGE_ACCESS_LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>محتوا (Markdown)</Label>
        <Textarea
          {...form.register("content")}
          rows={14}
          className="font-mono text-sm"
          placeholder={"# عنوان\n\nمتن سند به صورت Markdown..."}
        />
        {form.formState.errors.content && (
          <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="is_published"
          checked={form.watch("is_published")}
          onCheckedChange={(v) => form.setValue("is_published", v === true, { shouldDirty: true })}
        />
        <Label htmlFor="is_published" className="cursor-pointer">
          منتشر شود
        </Label>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
