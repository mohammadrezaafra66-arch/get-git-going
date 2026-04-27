import { useState, useEffect } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, ListChecks, Save } from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { formatDateFa } from "@/lib/i18n/formatters";
import {
  FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUS_COLORS,
  FEEDBACK_TYPE_LABELS, type FeedbackStatus, type FeedbackType,
} from "@/lib/feedback/constants";

export const Route = createFileRoute("/_app/feedback_/$feedbackId")({
  beforeLoad: async () => { await requirePermission("feedback", "view"); },
  component: FeedbackDetailPage,
});

function FeedbackDetailPage() {
  const { feedbackId } = useParams({ from: "/_app/feedback/$feedbackId" });
  const { user, roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["feedback-item", feedbackId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_items")
        .select("*")
        .eq("id", feedbackId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [status, setStatus] = useState<FeedbackStatus>("new");
  const [response, setResponse] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskId, setTaskId] = useState("");

  useEffect(() => {
    if (data) {
      setStatus(data.status as FeedbackStatus);
      setResponse(data.response ?? "");
    }
  }, [data]);

  const updateMut = useMutation({
    mutationFn: async (payload: {
      newStatus?: FeedbackStatus;
      newResponse?: string | null;
      taskId?: string;
    }) => {
      if (!user?.id || !data) throw new Error("no user");
      const updates: Record<string, unknown> = {};
      const auditEntries: Array<{ action: string; diff: Record<string, unknown> }> = [];

      if (payload.newStatus && payload.newStatus !== data.status) {
        updates.status = payload.newStatus;
        auditEntries.push({
          action: "feedback_status_changed",
          diff: { old_status: data.status, new_status: payload.newStatus },
        });
      }
      if (payload.newResponse !== undefined && (payload.newResponse ?? "") !== (data.response ?? "")) {
        updates.response = payload.newResponse;
        updates.responded_by = user.id;
        updates.responded_at = new Date().toISOString();
        auditEntries.push({
          action: "feedback_response_added",
          diff: { response_length: (payload.newResponse ?? "").length },
        });
      }
      if (payload.taskId) {
        updates.converted_task_id = payload.taskId;
        updates.status = "converted_to_task";
        auditEntries.push({
          action: "feedback_converted_to_task",
          diff: { task_id: payload.taskId },
        });
      }

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase.from("feedback_items").update(updates).eq("id", feedbackId);
      if (error) throw error;

      for (const entry of auditEntries) {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          action: entry.action,
          entity_type: "feedback_item",
          entity_id: feedbackId,
          diff: entry.diff as never,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback-item", feedbackId] });
      qc.invalidateQueries({ queryKey: ["feedback-items"] });
      toast.success("تغییرات ذخیره شد");
    },
    onError: (e) => {
      console.error(e);
      toast.error("ذخیره تغییرات ناموفق بود");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="ms-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="بازخورد یافت نشد" description="ممکن است حذف شده یا دسترسی ندارید" />
        <Button asChild variant="outline"><Link to="/feedback"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link></Button>
      </div>
    );
  }

  const attachments = (Array.isArray(data.attachment_urls) ? data.attachment_urls : []) as string[];

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.title}
        description={`ثبت‌شده در ${formatDateFa(data.created_at)}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/feedback"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{FEEDBACK_TYPE_LABELS[data.type as FeedbackType]}</Badge>
        <Badge variant="outline" className={FEEDBACK_STATUS_COLORS[data.status as FeedbackStatus]}>
          {FEEDBACK_STATUS_LABELS[data.status as FeedbackStatus]}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">شرح کامل</CardTitle></CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm leading-7">{data.description}</CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {data.where_occurred && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">محل وقوع</CardTitle></CardHeader>
            <CardContent className="text-sm">{data.where_occurred}</CardContent></Card>
        )}
        {data.impact && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">اثر</CardTitle></CardHeader>
            <CardContent className="text-sm">{data.impact}</CardContent></Card>
        )}
        {data.suggestion && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">پیشنهاد</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{data.suggestion}</CardContent></Card>
        )}
      </div>

      {attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">پیوست‌ها</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {attachments.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline break-all"
                  >{url}</a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.response && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">پاسخ مدیر</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <p className="whitespace-pre-wrap text-sm leading-7">{data.response}</p>
            {data.responded_at && (
              <p className="text-xs text-muted-foreground">{formatDateFa(data.responded_at)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {data.converted_task_id && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">شناسه وظیفه مرتبط</CardTitle></CardHeader>
          <CardContent className="font-mono text-sm">{data.converted_task_id}</CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base">مدیریت بازخورد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>وضعیت</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>پاسخ مدیر</Label>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={4}
                maxLength={3000}
                placeholder="پاسخ خود را وارد کنید..."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListChecks className="ms-1 h-4 w-4" />تبدیل به وظیفه
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>تبدیل به وظیفه</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label>شناسه وظیفه</Label>
                    <Input
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      placeholder="UUID یا شماره وظیفه"
                    />
                    <p className="text-xs text-muted-foreground">
                      پس از تأیید، وضعیت بازخورد به «تبدیل به وظیفه» تغییر می‌کند.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>انصراف</Button>
                    <Button
                      disabled={!taskId.trim() || updateMut.isPending}
                      onClick={async () => {
                        await updateMut.mutateAsync({ taskId: taskId.trim() });
                        setTaskDialogOpen(false);
                        setTaskId("");
                      }}
                    >
                      {updateMut.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                      تأیید
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                size="sm"
                disabled={updateMut.isPending}
                onClick={() => updateMut.mutate({
                  newStatus: status,
                  newResponse: response.trim() || null,
                })}
              >
                {updateMut.isPending ? (
                  <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ms-1 h-4 w-4" />
                )}
                ذخیره تغییرات
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
