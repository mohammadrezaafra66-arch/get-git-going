import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Pencil, Trash2, Eye, EyeOff, FileQuestion, Loader2 } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CourseForm, type CourseFormValues } from "@/shared/components/CourseForm";
import { LessonForm, type LessonFormValues } from "@/shared/components/LessonForm";
import { QuizForm, type QuizFormValues, type QuizQuestion } from "@/shared/components/QuizForm";

export const Route = createFileRoute("/_app/academy_/manage")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager"]); },
  component: AcademyManagePage,
});

interface CourseRow { id: string; title: string; description: string | null; is_published: boolean; }
interface LessonRow { id: string; course_id: string; title: string; content: string | null; video_url: string | null; attachment_url: string | null; order_index: number; }

function AcademyManagePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonRow | null>(null);
  const [creatingLessonFor, setCreatingLessonFor] = useState<string | null>(null);
  const [editingQuizForLesson, setEditingQuizForLesson] = useState<LessonRow | null>(null);

  const { data: courses, isLoading } = useQuery({
    queryKey: ["academy-courses-manage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, description, is_published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CourseRow[];
    },
  });

  const { data: lessons } = useQuery({
    queryKey: ["academy-lessons-manage", expandedCourse],
    enabled: !!expandedCourse,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select("id, course_id, title, content, video_url, attachment_url, order_index")
        .eq("course_id", expandedCourse!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LessonRow[];
    },
  });

  const { data: quizzesByLesson } = useQuery({
    queryKey: ["academy-quizzes-manage", expandedCourse, lessons?.map((l) => l.id).join(",")],
    enabled: !!expandedCourse && !!lessons && lessons.length > 0,
    queryFn: async () => {
      const ids = (lessons ?? []).map((l) => l.id);
      if (ids.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("academy_quizzes").select("id, lesson_id").in("lesson_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((q) => { map[q.lesson_id] = q.id; });
      return map;
    },
  });

  const audit = async (action: string, entity_type: string, entity_id: string, diff: any) => {
    if (!user?.id) return;
    const { error } = await supabase.from("audit_logs").insert({ action, entity_type, entity_id, actor_id: user.id, diff });
    if (error) console.warn("audit insert failed:", error);
  };

  const courseCreate = useMutation({
    mutationFn: async (v: CourseFormValues) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { data, error } = await supabase
        .from("academy_courses")
        .insert({ title: v.title, description: v.description || null, is_published: v.is_published, created_by: user.id })
        .select("id").single();
      if (error) throw error;
      await audit("academy_course_created", "academy_course", data.id, { title: v.title });
    },
    onSuccess: () => { toast.success("دوره ایجاد شد"); setCreatingCourse(false); qc.invalidateQueries({ queryKey: ["academy-courses-manage"] }); },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const courseUpdate = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: CourseFormValues }) => {
      const { error } = await supabase.from("academy_courses")
        .update({ title: v.title, description: v.description || null, is_published: v.is_published })
        .eq("id", id);
      if (error) throw error;
      await audit("academy_course_updated", "academy_course", id, { title: v.title, is_published: v.is_published });
    },
    onSuccess: () => { toast.success("به‌روزرسانی شد"); setEditingCourse(null); qc.invalidateQueries({ queryKey: ["academy-courses-manage"] }); },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const courseDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academy_courses").delete().eq("id", id);
      if (error) throw error;
      await audit("academy_course_deleted", "academy_course", id, {});
    },
    onSuccess: () => { toast.success("دوره حذف شد"); qc.invalidateQueries({ queryKey: ["academy-courses-manage"] }); },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const lessonSave = useMutation({
    mutationFn: async ({ id, courseId, v }: { id?: string; courseId: string; v: LessonFormValues }) => {
      const payload = {
        title: v.title,
        content: v.content || null,
        video_url: v.video_url || null,
        attachment_url: v.attachment_url || null,
        order_index: v.order_index,
        course_id: courseId,
      };
      if (id) {
        const { error } = await supabase.from("academy_lessons").update(payload).eq("id", id);
        if (error) throw error;
        await audit("academy_lesson_updated", "academy_lesson", id, { title: v.title });
      } else {
        const { data, error } = await supabase.from("academy_lessons").insert(payload).select("id").single();
        if (error) throw error;
        await audit("academy_lesson_created", "academy_lesson", data.id, { title: v.title, course_id: courseId });
      }
    },
    onSuccess: () => {
      toast.success("ذخیره شد"); setEditingLesson(null); setCreatingLessonFor(null);
      qc.invalidateQueries({ queryKey: ["academy-lessons-manage", expandedCourse] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const lessonDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academy_lessons").delete().eq("id", id);
      if (error) throw error;
      await audit("academy_lesson_deleted", "academy_lesson", id, {});
    },
    onSuccess: () => { toast.success("درس حذف شد"); qc.invalidateQueries({ queryKey: ["academy-lessons-manage", expandedCourse] }); },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const quizSave = useMutation({
    mutationFn: async ({ lesson, values }: { lesson: LessonRow; values: QuizFormValues }) => {
      // Upsert quiz (one per lesson)
      const existingQuizId = quizzesByLesson?.[lesson.id];
      let quizId = existingQuizId;
      if (existingQuizId) {
        const { error } = await supabase.from("academy_quizzes")
          .update({ title: values.title || null, passing_score: values.passing_score })
          .eq("id", existingQuizId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("academy_quizzes")
          .insert({ lesson_id: lesson.id, title: values.title || null, passing_score: values.passing_score })
          .select("id").single();
        if (error) throw error;
        quizId = data.id;
      }
      // Replace questions: delete then insert
      if (existingQuizId) {
        await supabase.from("academy_quiz_questions").delete().eq("quiz_id", existingQuizId);
      }
      const rows = values.questions.map((q, i) => ({
        quiz_id: quizId!,
        question_text: q.question_text.trim(),
        options: q.options as any,
        correct_value: q.correct_value,
        order_index: i,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("academy_quiz_questions").insert(rows);
        if (error) throw error;
      }
      await audit("academy_quiz_saved", "academy_quiz", quizId!, { lesson_id: lesson.id, questions_count: rows.length });
    },
    onSuccess: () => {
      toast.success("آزمون ذخیره شد"); setEditingQuizForLesson(null);
      qc.invalidateQueries({ queryKey: ["academy-quizzes-manage", expandedCourse] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  // Load existing quiz questions when editing
  const { data: editingQuizData } = useQuery({
    queryKey: ["academy-quiz-editing", editingQuizForLesson?.id],
    enabled: !!editingQuizForLesson,
    queryFn: async () => {
      const lesson = editingQuizForLesson!;
      const quizId = quizzesByLesson?.[lesson.id];
      if (!quizId) return { title: "", passing_score: 50, questions: [] as QuizQuestion[] };
      const { data: quiz } = await supabase.from("academy_quizzes").select("title, passing_score").eq("id", quizId).maybeSingle();
      const { data: questions } = await supabase.from("academy_quiz_questions")
        .select("id, question_text, options, correct_value, order_index")
        .eq("quiz_id", quizId).order("order_index", { ascending: true });
      return {
        title: quiz?.title ?? "",
        passing_score: quiz?.passing_score ?? 50,
        questions: (questions ?? []).map((q) => ({
          id: q.id,
          question_text: q.question_text,
          options: Array.isArray(q.options) ? (q.options as { text: string }[]) : [],
          correct_value: q.correct_value,
          order_index: q.order_index,
        })),
      };
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت آکادمی"
        description="ایجاد و ویرایش دوره‌ها، درس‌ها و آزمون‌ها"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/academy"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            <Button size="sm" onClick={() => setCreatingCourse(true)}>
              <Plus className="ms-1 h-4 w-4" />دوره جدید
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : !courses || courses.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">دوره‌ای ثبت نشده است.</p>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => {
            const expanded = expandedCourse === c.id;
            return (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedCourse(expanded ? null : c.id)}
                      className="flex-1 text-start font-medium hover:text-primary"
                    >
                      {c.title}
                    </button>
                    <Badge variant={c.is_published ? "default" : "secondary"}>
                      {c.is_published ? <Eye className="ms-1 h-3 w-3" /> : <EyeOff className="ms-1 h-3 w-3" />}
                      {c.is_published ? "منتشرشده" : "پیش‌نویس"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setEditingCourse(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm(`حذف دوره «${c.title}»؟ تمام درس‌ها و آزمون‌ها نیز حذف می‌شوند.`)) courseDelete.mutate(c.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {expanded && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold">درس‌ها</h4>
                        <Button variant="outline" size="sm" onClick={() => setCreatingLessonFor(c.id)}>
                          <Plus className="ms-1 h-4 w-4" />درس جدید
                        </Button>
                      </div>
                      {(lessons ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">درسی ثبت نشده است.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(lessons ?? []).map((l) => (
                            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
                              <span className="text-xs text-muted-foreground">#{l.order_index}</span>
                              <span className="flex-1">{l.title}</span>
                              {quizzesByLesson?.[l.id] && <Badge variant="outline" className="text-[10px]"><FileQuestion className="ms-1 h-3 w-3" />آزمون</Badge>}
                              <Button variant="ghost" size="sm" onClick={() => setEditingQuizForLesson(l)}>
                                <FileQuestion className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingLesson(l)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                if (confirm(`حذف درس «${l.title}»؟`)) lessonDelete.mutate(l.id);
                              }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Course Dialogs */}
      <Dialog open={creatingCourse} onOpenChange={(o) => !o && setCreatingCourse(false)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>دوره جدید</DialogTitle></DialogHeader>
          <CourseForm
            onSubmit={async (v) => { await courseCreate.mutateAsync(v); }}
            submitting={courseCreate.isPending}
            onCancel={() => setCreatingCourse(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCourse} onOpenChange={(o) => !o && setEditingCourse(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>ویرایش دوره</DialogTitle></DialogHeader>
          {editingCourse && (
            <CourseForm
              defaultValues={{ title: editingCourse.title, description: editingCourse.description ?? "", is_published: editingCourse.is_published }}
              onSubmit={async (v) => { await courseUpdate.mutateAsync({ id: editingCourse.id, v }); }}
              submitting={courseUpdate.isPending}
              onCancel={() => setEditingCourse(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Lesson Dialogs */}
      <Dialog open={!!creatingLessonFor || !!editingLesson} onOpenChange={(o) => { if (!o) { setCreatingLessonFor(null); setEditingLesson(null); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingLesson ? "ویرایش درس" : "درس جدید"}</DialogTitle></DialogHeader>
          <LessonForm
            defaultValues={editingLesson ? {
              title: editingLesson.title,
              content: editingLesson.content ?? "",
              video_url: editingLesson.video_url ?? "",
              attachment_url: editingLesson.attachment_url ?? "",
              order_index: editingLesson.order_index,
            } : { order_index: (lessons?.length ?? 0) }}
            onSubmit={async (v) => {
              const courseId = editingLesson?.course_id ?? creatingLessonFor!;
              await lessonSave.mutateAsync({ id: editingLesson?.id, courseId, v });
            }}
            submitting={lessonSave.isPending}
            onCancel={() => { setCreatingLessonFor(null); setEditingLesson(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Quiz Dialog */}
      <Dialog open={!!editingQuizForLesson} onOpenChange={(o) => !o && setEditingQuizForLesson(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>آزمون درس: {editingQuizForLesson?.title}</DialogTitle></DialogHeader>
          {editingQuizForLesson && (
            editingQuizData ? (
              <QuizForm
                defaultValues={editingQuizData}
                onSubmit={async (v) => { await quizSave.mutateAsync({ lesson: editingQuizForLesson, values: v }); }}
                submitting={quizSave.isPending}
                onCancel={() => setEditingQuizForLesson(null)}
              />
            ) : (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}