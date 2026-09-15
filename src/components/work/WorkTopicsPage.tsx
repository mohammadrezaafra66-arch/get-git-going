import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createWorkTopic,
  listWorkTopics,
  type WorkTopic,
} from "@/lib/work";
import { TOPIC_STATUS_LABELS } from "./labels";

export function WorkTopicsPage() {
  const [topics, setTopics] = useState<WorkTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTopics(await listWorkTopics({ limit: 100 }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("عنوان موضوع الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const topic = await createWorkTopic({
        title: trimmed,
        body: body.trim() || null,
      });
      toast.success("موضوع ساخته شد.");
      setCreateOpen(false);
      setTitle("");
      setBody("");
      await load();
      return topic;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ساخت موضوع ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-[70vh] bg-[linear-gradient(180deg,#f8fafc_0%,#f0f9ff_100%)]"
      dir="rtl"
    >
      <div className="container max-w-3xl space-y-5 py-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/operations/work">
            <ArrowRight className="ml-1 h-4 w-4" />
            بازگشت به تابلو
          </Link>
        </Button>

        <PageHeader
          title="موضوع‌ها"
          description="گروه‌بندی کارهای مرتبط زیر یک موضوع مشترک"
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="ml-1.5 h-4 w-4" />
              موضوع جدید
            </Button>
          }
        />

        {loading && (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال بارگذاری…
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        {!loading && !error && topics.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            هنوز موضوعی نیست. اولین موضوع را بسازید.
          </p>
        )}

        <ul className="space-y-2">
          {topics.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to="/operations/work/topics/$topicId"
                  params={{ topicId: t.id }}
                  className="font-medium text-slate-800 hover:text-teal-800"
                >
                  {t.title}
                </Link>
                {t.body && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.body}
                  </p>
                )}
              </div>
              <Badge variant="secondary">{TOPIC_STATUS_LABELS[t.status]}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>موضوع جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="topic-title">عنوان</Label>
              <Input
                id="topic-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-body">توضیح</Label>
              <Textarea
                id="topic-body"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              ایجاد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
