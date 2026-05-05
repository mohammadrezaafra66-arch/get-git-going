import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, Download, FileQuestion } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_app/academy_/$courseId_/$lessonId")({
  beforeLoad: async () => { await requirePermission("academy", "view"); },
  component: LessonPage,
});

marked.setOptions({ gfm: true, breaks: true });

function LessonPage() {
  const { courseId, lessonId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["academy-lesson", lessonId, user?.id],
    queryFn: async () => {
      const { data: lesson, error } = await supabase
        .from("academy_lessons")
        .select("id, course_id, title, content, video_url, attachment_url, order_index")
        .eq("id", lessonId)
        .maybeSingle();
      if (error) throw error;
      if (!lesson) return null;
      const { data: quiz } = await supabase
        .from("academy_quizzes")
        .select("id")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      let completed = false;
      if (user?.id) {
        const { data: prog } = await supabase
          .from("academy_user_progress")
          .select("completed")
          .eq("user_id", user.id)
          .eq("lesson_id", lessonId)
          .maybeSingle();
        completed = !!prog?.completed;
      }
      return { lesson, quizId: quiz?.id ?? null, completed };
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { error } = await supabase.from("academy_user_progress").upsert(
        { user_id: user.id, course_id: courseId, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() },
        { onConflict: "user_id,course_id,lesson_id" },
      );
      if (error) throw error;
      const { error: aErr } = await supabase.from("audit_logs").insert({
        action: "academy_lesson_completed",
        entity_type: "academy_lesson",
        entity_id: lessonId,
        actor_id: user.id,
        diff: { course_id: courseId, lesson_id: lessonId },
      });
      if (aErr) console.warn("audit insert failed:", aErr);
    },
    onSuccess: () => {
      toast.success("درس به‌عنوان تکمیل‌شده ثبت شد");
      qc.invalidateQueries({ queryKey: ["academy-lesson", lessonId, user?.id] });
      qc.invalidateQueries({ queryKey: ["academy-course-detail", courseId, user?.id] });
      qc.invalidateQueries({ queryKey: ["academy-courses-list", user?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ثبت تکمیل"),
  });

  const html = useMemo(() => {
    if (!data?.lesson?.content) return "";
    try {
      const raw = marked.parse(data.lesson.content) as string;
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    }
    catch { return DOMPurify.sanitize(data.lesson.content); }
  }, [data?.lesson?.content]);

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>;
  if (!data || !data.lesson) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">درس یافت نشد.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/academy/$courseId" params={{ courseId }}><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
        </Button>
      </div>
    );
  }

  const { lesson, quizId, completed } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={lesson.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/academy/$courseId" params={{ courseId }}><ArrowRight className="ms-1 h-4 w-4" />بازگشت به دوره</Link>
          </Button>
        }
      />

      {lesson.video_url && (
        <Card>
          <CardContent className="p-3">
            <video src={lesson.video_url} controls preload="metadata" className="w-full rounded">
              مرورگر شما از پخش ویدئو پشتیبانی نمی‌کند.
            </video>
          </CardContent>
        </Card>
      )}

      {html && (
        <Card>
          <CardContent className="p-5">
            <div
              className="prose prose-sm max-w-none text-foreground rtl:prose-headings:text-right [&_*]:break-words"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </CardContent>
        </Card>
      )}

      {lesson.attachment_url && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">فایل ضمیمه درس</span>
            <Button asChild variant="outline" size="sm">
              <a href={lesson.attachment_url} target="_blank" rel="noopener noreferrer" download>
                <Download className="ms-1 h-4 w-4" />دانلود
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {completed ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span>شما این درس را تکمیل کرده‌اید.</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">پس از مطالعه کامل، تأیید کنید.</p>
              <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
                {completeMutation.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                تکمیل درس
              </Button>
            </>
          )}
          {quizId && (
            <Button asChild variant="default">
              <Link to="/academy/$courseId/$lessonId/quiz" params={{ courseId, lessonId }}>
                <FileQuestion className="ms-1 h-4 w-4" />شروع آزمون
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}