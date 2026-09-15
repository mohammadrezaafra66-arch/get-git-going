import { useState } from "react";
import { Loader2 } from "lucide-react";
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
  createWorkItem,
  listMergeSuggestions,
  type WorkDecisionBucket,
  type WorkItemKind,
  type WorkItemPriority,
  type WorkMode,
} from "@/lib/work";
import {
  ALL_BUCKETS,
  ALL_KINDS,
  ALL_MODES,
  ALL_PRIORITIES,
  BUCKET_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  PRIORITY_LABELS,
} from "./labels";

const NONE = "__none__";

export function CreateWorkDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (itemId: string, pendingMerges: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<WorkItemKind>("note");
  const [priority, setPriority] = useState<WorkItemPriority>("normal");
  const [decisionBucket, setDecisionBucket] = useState<WorkDecisionBucket | null>(
    null,
  );
  const [workMode, setWorkMode] = useState<WorkMode>("request");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setKind("note");
    setPriority("normal");
    setDecisionBucket(null);
    setWorkMode("request");
    setGroupName("");
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("عنوان کار الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const item = await createWorkItem({
        title: trimmed,
        body: body.trim() || null,
        kind,
        priority,
        decision_bucket: decisionBucket,
        work_mode: workMode,
        group_name: groupName.trim() || null,
      });
      const pending = await listMergeSuggestions({
        status: "pending",
        itemId: item.id,
        limit: 20,
      });
      toast.success("کار ثبت شد.");
      onCreated?.(item.id, pending.length);
      reset();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ثبت کار ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!saving) onOpenChange(v);
      }}
    >
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت کار جدید</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="work-title">عنوان</Label>
            <Input
              id="work-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان کوتاه و روشن"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work-body">شرح</Label>
            <Textarea
              id="work-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="جزئیات، زمینه، یا لینک‌ها…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as WorkItemKind)}>
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
              <Label>اولویت</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as WorkItemPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>سطل تصمیم</Label>
              <Select
                value={decisionBucket ?? NONE}
                onValueChange={(v) =>
                  setDecisionBucket(v === NONE ? null : (v as WorkDecisionBucket))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="بدون سطل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون سطل</SelectItem>
                  {ALL_BUCKETS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BUCKET_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>حالت کار</Label>
              <Select
                value={workMode}
                onValueChange={(v) => setWorkMode(v as WorkMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work-group">گروه</Label>
            <Input
              id="work-group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="اختیاری — مثلاً فروش یا انبار"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            انصراف
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            ثبت کار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
