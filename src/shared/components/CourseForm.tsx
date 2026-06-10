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

const schema = z.object({
  title: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  is_published: z.boolean(),
});

export type CourseFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<CourseFormValues>;
  onSubmit: (values: CourseFormValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

export function CourseForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "ذخیره",
  onCancel,
}: Props) {
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      description: defaultValues?.description ?? "",
      is_published: defaultValues?.is_published ?? false,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        title: defaultValues.title ?? "",
        description: defaultValues.description ?? "",
        is_published: defaultValues.is_published ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues?.title, defaultValues?.description, defaultValues?.is_published]);

  return (
    <form
      dir="rtl"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        await onSubmit(v);
      })}
    >
      <div className="space-y-1.5">
        <Label>عنوان دوره</Label>
        <Input
          {...form.register("title")}
          maxLength={150}
          placeholder="مثلاً: آموزش فروش حرفه‌ای"
        />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>توضیحات</Label>
        <Textarea
          {...form.register("description")}
          rows={4}
          placeholder="توضیح کوتاه درباره دوره"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="course_is_published"
          checked={form.watch("is_published")}
          onCheckedChange={(v) => form.setValue("is_published", v === true, { shouldDirty: true })}
        />
        <Label htmlFor="course_is_published" className="cursor-pointer">
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
