import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEEDBACK_TYPES, type FeedbackType } from "@/lib/feedback/constants";
import { FeedbackAttachmentUploader, type FeedbackAttachment } from "./FeedbackAttachmentUploader";

const schema = z.object({
  title: z.string().trim().min(5, "حداقل ۵ کاراکتر").max(200, "حداکثر ۲۰۰ کاراکتر"),
  type: z.enum(["bug", "process_issue", "improvement", "operational"]),
  description: z.string().trim().min(20, "حداقل ۲۰ کاراکتر").max(3000, "حداکثر ۳۰۰۰ کاراکتر"),
  where_occurred: z.string().trim().max(500).optional().or(z.literal("")),
  impact: z.string().trim().max(1000).optional().or(z.literal("")),
  suggestion: z.string().trim().max(1500).optional().or(z.literal("")),
});

export type FeedbackFormValues = z.infer<typeof schema>;

interface Props {
  userId: string;
  onSubmit: (values: {
    title: string;
    type: FeedbackType;
    description: string;
    where_occurred: string | null;
    impact: string | null;
    suggestion: string | null;
    attachment_urls: string[];
  }) => Promise<void> | void;
  submitting?: boolean;
  onCancel?: () => void;
}

export function FeedbackForm({ userId, onSubmit, submitting, onCancel }: Props) {
  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      type: "bug",
      description: "",
      where_occurred: "",
      impact: "",
      suggestion: "",
    },
  });
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([]);

  return (
    <form
      dir="rtl"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        await onSubmit({
          title: v.title,
          type: v.type,
          description: v.description,
          where_occurred: v.where_occurred?.trim() || null,
          impact: v.impact?.trim() || null,
          suggestion: v.suggestion?.trim() || null,
          attachment_urls: attachments.map((a) => a.path),
        });
      })}
    >
      <div className="space-y-1.5">
        <Label>عنوان</Label>
        <Input {...form.register("title")} placeholder="خلاصه مشکل یا پیشنهاد" maxLength={200} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>نوع</Label>
        <Select
          value={form.watch("type")}
          onValueChange={(v) => form.setValue("type", v as FeedbackType, { shouldDirty: true })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>شرح کامل</Label>
        <Textarea {...form.register("description")} rows={6} placeholder="توضیح کامل..." />
        {form.formState.errors.description && (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>کجا رخ داده؟ (اختیاری)</Label>
          <Input
            {...form.register("where_occurred")}
            placeholder="نام صفحه یا فرآیند"
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <Label>اثر آن چیست؟ (اختیاری)</Label>
          <Input {...form.register("impact")} placeholder="میزان اثرگذاری" maxLength={1000} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>پیشنهاد (اختیاری)</Label>
        <Textarea
          {...form.register("suggestion")}
          rows={3}
          maxLength={1500}
          placeholder="پیشنهاد شما برای بهبود..."
        />
      </div>

      <FeedbackAttachmentUploader
        userId={userId}
        value={attachments}
        onChange={setAttachments}
        disabled={submitting}
      />

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          ثبت بازخورد
        </Button>
      </div>
    </form>
  );
}
