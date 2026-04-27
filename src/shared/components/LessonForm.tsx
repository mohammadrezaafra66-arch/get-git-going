import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  title: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(200, "حداکثر ۲۰۰ کاراکتر"),
  content: z.string().trim().optional().or(z.literal("")),
  video_url: z.string().trim().max(500).optional().or(z.literal("")),
  attachment_url: z.string().trim().max(500).optional().or(z.literal("")),
  order_index: z.number().int().min(0),
}).refine((d) => (d.content?.trim().length ?? 0) >= 10 || (d.video_url?.trim().length ?? 0) > 0, {
  message: "حداقل محتوا (۱۰ کاراکتر) یا آدرس ویدئو الزامی است",
  path: ["content"],
});

export type LessonFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<LessonFormValues>;
  onSubmit: (values: LessonFormValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

export function LessonForm({ defaultValues, onSubmit, submitting, submitLabel = "ذخیره", onCancel }: Props) {
  const form = useForm<LessonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      content: defaultValues?.content ?? "",
      video_url: defaultValues?.video_url ?? "",
      attachment_url: defaultValues?.attachment_url ?? "",
      order_index: defaultValues?.order_index ?? 0,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        title: defaultValues.title ?? "",
        content: defaultValues.content ?? "",
        video_url: defaultValues.video_url ?? "",
        attachment_url: defaultValues.attachment_url ?? "",
        order_index: defaultValues.order_index ?? 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues?.title, defaultValues?.content, defaultValues?.video_url, defaultValues?.attachment_url, defaultValues?.order_index]);

  return (
    <form dir="rtl" className="space-y-4" onSubmit={form.handleSubmit(async (v) => { await onSubmit(v); })}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>عنوان درس</Label>
          <Input {...form.register("title")} maxLength={200} />
          {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>ترتیب</Label>
          <Input
            type="number"
            min={0}
            value={form.watch("order_index")}
            onChange={(e) => form.setValue("order_index", Number(e.target.value) || 0, { shouldDirty: true })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>محتوا (Markdown)</Label>
        <Textarea {...form.register("content")} rows={10} className="font-mono text-sm" placeholder={"# عنوان\n\nمتن درس..."} />
        {form.formState.errors.content && <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>آدرس ویدئو</Label>
          <Input {...form.register("video_url")} placeholder="https://..." dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>فایل ضمیمه</Label>
          <Input {...form.register("attachment_url")} placeholder="https://..." dir="ltr" />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>انصراف</Button>}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}