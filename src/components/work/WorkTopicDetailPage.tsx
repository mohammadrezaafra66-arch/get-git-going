import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Save, Sparkles, Unlink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  getWorkTopic,
  linkItemToTopic,
  listWorkItems,
  suggestTopicTitle,
  unlinkItemFromTopic,
  updateWorkTopic,
  type WorkItem,
  type WorkTopic,
  type WorkTopicStatus,
} from "@/lib/work";
import { KIND_LABELS, STATUS_LABELS, TOPIC_STATUS_LABELS } from "./labels";

export function WorkTopicDetailPage({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<WorkTopic | null>(null);
  const [linked, setLinked] = useState<WorkItem[]>([]);
  const [unlinked, setUnlinked] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [selectedForSuggest, setSelectedForSuggest] = useState<Set<string>>(
    new Set(),
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<WorkTopicStatus>("open");
  const [linkPick, setLinkPick] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getWorkTopic(topicId);
      if (!row) {
        setError("موضوع پیدا نشد یا دسترسی ندارید.");
        setTopic(null);
        return;
      }
      setTopic(row);
      setTitle(row.title);
      setBody(row.body ?? "");
      setStatus(row.status);

      const [linkedRows, openRows] = await Promise.all([
        listWorkItems({ topic_id: topicId, limit: 100 }),
        listWorkItems({ topic_id: null, openOnly: true, limit: 100 }),
      ]);
      setLinked(linkedRows);
      setUnlinked(openRows);
      setSelectedForSuggest(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectable = useMemo(
    () => [...linked, ...unlinked.filter((u) => !linked.some((l) => l.id === u.id))],
    [linked, unlinked],
  );

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("عنوان الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateWorkTopic(topicId, {
        title: trimmed,
        body: body.trim() || null,
        status,
      });
      setTopic(updated);
      toast.success("موضوع ذخیره شد.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ذخیره ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function linkSelected() {
    if (!linkPick) {
      toast.error("یک کار انتخاب کنید.");
      return;
    }
    setBusyItem(linkPick);
    try {
      await linkItemToTopic(linkPick, topicId);
      toast.success("کار به موضوع متصل شد.");
      setLinkPick("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "اتصال ناموفق بود.");
    } finally {
      setBusyItem(null);
    }
  }

  async function unlink(itemId: string) {
    setBusyItem(itemId);
    try {
      await unlinkItemFromTopic(itemId);
      toast.success("اتصال برداشته شد.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "جدا کردن ناموفق بود.");
    } finally {
      setBusyItem(null);
    }
  }

  async function runSuggest() {
    const ids = Array.from(selectedForSuggest);
    if (ids.length === 0) {
      toast.error("حداقل یک کار را برای پیشنهاد عنوان انتخاب کنید.");
      return;
    }
    setSuggesting(true);
    try {
      const suggestion = await suggestTopicTitle(ids);
      setTitle(suggestion);
      toast.success("عنوان پیشنهادی اعمال شد — در صورت تمایل ویرایش کنید.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "پیشنهاد عنوان ناموفق بود.");
    } finally {
      setSuggesting(false);
    }
  }

  function toggleSuggest(id: string) {
    setSelectedForSuggest((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="container max-w-3xl space-y-4 py-8" dir="rtl">
        <p className="text-sm text-rose-700">{error ?? "موضوع یافت نشد."}</p>
        <Button variant="outline" asChild>
          <Link to="/operations/work/topics">بازگشت</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-[70vh] bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)]"
      dir="rtl"
    >
      <div className="container max-w-3xl space-y-5 py-6">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/operations/work/topics">
              <ArrowRight className="ml-1 h-4 w-4" />
              فهرست موضوع‌ها
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/operations/work">تابلو کار</Link>
          </Button>
        </div>

        <PageHeader
          title={title || "جزئیات موضوع"}
          description="ویرایش موضوع، اتصال کارها و پیشنهاد عنوان"
          actions={
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-1.5 h-4 w-4" />
              )}
              ذخیره
            </Button>
          }
        />

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="topic-detail-title">عنوان</Label>
            <Input
              id="topic-detail-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic-detail-body">توضیح</Label>
            <Textarea
              id="topic-detail-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>وضعیت</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as WorkTopicStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{TOPIC_STATUS_LABELS.open}</SelectItem>
                <SelectItem value="closed">
                  {TOPIC_STATUS_LABELS.closed}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={suggesting}
              onClick={() => void runSuggest()}
            >
              {suggesting ? (
                <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="ml-1.5 h-4 w-4" />
              )}
              پیشنهاد عنوان از کارهای انتخاب‌شده
            </Button>
            <span className="self-center text-xs text-slate-500">
              کارهای زیر را تیک بزنید
            </span>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">کارهای متصل</h2>
          {linked.length === 0 && (
            <p className="text-sm text-slate-500">هنوز کاری به این موضوع وصل نیست.</p>
          )}
          <ul className="space-y-2">
            {linked.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedForSuggest.has(item.id)}
                    onChange={() => toggleSuggest(item.id)}
                  />
                  <Link
                    to="/operations/work/$itemId"
                    params={{ itemId: item.id }}
                    className="truncate hover:text-teal-800"
                  >
                    {item.title}
                  </Link>
                  <Badge variant="outline">{STATUS_LABELS[item.status]}</Badge>
                  <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyItem === item.id}
                  onClick={() => void unlink(item.id)}
                >
                  <Unlink className="ml-1 h-3.5 w-3.5" />
                  جدا کردن
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label>اتصال کار باز بدون موضوع</Label>
              <Select value={linkPick || undefined} onValueChange={setLinkPick}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کار…" />
                </SelectTrigger>
                <SelectContent>
                  {unlinked.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!linkPick || busyItem === linkPick}
              onClick={() => void linkSelected()}
            >
              اتصال
            </Button>
          </div>

          {selectable.filter((s) => !linked.some((l) => l.id === s.id)).length >
            0 && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">
                کارهای بدون موضوع (برای پیشنهاد عنوان):
              </p>
              <ul className="space-y-1">
                {unlinked.slice(0, 12).map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedForSuggest.has(item.id)}
                        onChange={() => toggleSuggest(item.id)}
                      />
                      {item.title}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
