import { useState } from "react";
import {
  MOODS,
  STATUS_LABELS,
  FOLLOW_UP_OPTIONS,
  updateEntryStatus,
  updateManagerNote,
  type MoodEntry,
  type EntryStatus,
} from "@/lib/operations/daily-mood";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function DailyMoodEntryDetails({
  entry,
  onClose,
  onChanged,
}: {
  entry: MoodEntry;
  onClose: () => void;
  onChanged: (next: MoodEntry) => void;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [note, setNote] = useState(entry.manager_note ?? "");
  const [busy, setBusy] = useState(false);

  const moodMeta = MOODS.find((m) => m.key === entry.mood_key);

  const saveStatus = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateEntryStatus(entry.id, status, user.id);
      onChanged({ ...entry, status });
      toast.success("وضعیت به‌روزرسانی شد");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateManagerNote(entry.id, note, user.id);
      onChanged({ ...entry, manager_note: note });
      toast.success("یادداشت ذخیره شد");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>جزئیات ثبت حال‌وهوا</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{moodMeta?.emoji}</span>
            <div>
              <p className="font-semibold">{entry.mood_label}</p>
              <p className="text-xs text-muted-foreground">
                {entry.mood_date} • {new Date(entry.created_at).toLocaleString("fa-IR")}
              </p>
            </div>
            <Badge variant="outline" className="ms-auto">
              {STATUS_LABELS[entry.status]}
            </Badge>
          </div>

          {entry.reasons.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">دلایل</p>
              <div className="flex flex-wrap gap-1">
                {entry.reasons.map((r) => (
                  <Badge key={r} variant="secondary">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {entry.answers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">پاسخ‌های سناریو</p>
              {entry.answers.map((a, i) => (
                <div key={i} className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{a.question_text}</p>
                  <p>
                    {Array.isArray(a.value)
                      ? (a.value as string[]).join("، ")
                      : String(a.value ?? "")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {entry.free_text && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">متن آزاد</p>
              <p className="rounded-md border p-3 leading-loose whitespace-pre-line">
                {entry.free_text}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">پیگیری:</span>
            <Badge>
              {FOLLOW_UP_OPTIONS.find((o) => o.value === entry.wants_follow_up)?.label ??
                entry.wants_follow_up}
            </Badge>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">تغییر وضعیت رسیدگی</label>
                <Select value={status} onValueChange={(v) => setStatus(v as EntryStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void saveStatus()} disabled={busy || status === entry.status}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ذخیره وضعیت"}
              </Button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">یادداشت مدیریتی (خصوصی)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                className="w-full rounded-md border bg-card p-3 text-sm min-h-24"
                placeholder="فقط برای مدیران قابل مشاهده…"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{note.length}/2000</span>
                <Button size="sm" onClick={() => void saveNote()} disabled={busy}>
                  ذخیره یادداشت
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
