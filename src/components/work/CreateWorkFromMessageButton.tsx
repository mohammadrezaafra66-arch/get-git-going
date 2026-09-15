import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  buildCreatePayloadFromChat,
  createWorkItem,
  listMergeSuggestions,
  type WorkItemKind,
} from "@/lib/work";
import { ALL_KINDS, KIND_LABELS } from "./labels";

/**
 * Phase 3 chat action — «ثبت کار از این پیام».
 * Mirrors InquiryButton: compact intake dialog → lib helper → createWorkItem.
 * Does not touch messenger AI SSE.
 */
export function CreateWorkFromMessageButton({
  messageText,
  disabled,
  variant = "icon",
}: {
  messageText: string;
  disabled?: boolean;
  variant?: "icon" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<WorkItemKind>("note");
  const [acceptance, setAcceptance] = useState("");
  const [saving, setSaving] = useState(false);

  function openDialog() {
    const text = (messageText ?? "").trim();
    if (!text) {
      toast.error("متن پیام خالی است.");
      return;
    }
    const first =
      text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? text;
    setTitle(first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first);
    setKind("note");
    setAcceptance("");
    setOpen(true);
  }

  async function submit() {
    const text = (messageText ?? "").trim();
    if (!text) {
      toast.error("متن پیام خالی است.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildCreatePayloadFromChat({
        messageText: text,
        optionalAnswers: {
          kind,
          acceptance_criteria: acceptance.trim() || null,
        },
      });
      if (title.trim()) payload.title = title.trim();

      const item = await createWorkItem(payload);
      const pending = await listMergeSuggestions({
        status: "pending",
        itemId: item.id,
        limit: 10,
      });

      if (pending.length > 0) {
        toast.success("کار از پیام ثبت شد — پیشنهاد ادغام در تابلو آماده است.", {
          action: {
            label: "تابلو ادغام",
            onClick: () => {
              window.location.assign("/operations/work#work-merge-panel");
            },
          },
        });
      } else {
        toast.success("کار از پیام ثبت شد.", {
          action: {
            label: "مشاهده",
            onClick: () => {
              window.location.assign(`/operations/work/${item.id}`);
            },
          },
        });
      }
      setOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ثبت کار ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled || !(messageText ?? "").trim()}
          onClick={openDialog}
          aria-label="ثبت کار از این پیام"
          title="ثبت کار از این پیام"
          className="h-7 w-7"
        >
          <ClipboardList className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || !(messageText ?? "").trim()}
          onClick={openDialog}
        >
          <ClipboardList className="h-4 w-4" />
          ثبت کار از این پیام
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>ثبت کار از این پیام</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap text-right">
              {(messageText ?? "").trim()}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chat-work-title">عنوان</Label>
              <Input
                id="chat-work-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as WorkItemKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chat-work-accept">معیار پذیرش (اختیاری)</Label>
              <Textarea
                id="chat-work-accept"
                rows={2}
                value={acceptance}
                onChange={(e) => setAcceptance(e.target.value)}
                placeholder="چه چیزی این کار را تمام‌شده می‌کند؟"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              انصراف
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              ثبت کار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
