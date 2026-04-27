import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, FileQuestion, GraduationCap } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_app/academy_/$courseId")({
  beforeLoad: async () => { await requirePermission("academy", "view"); },
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["academy-course-detail", courseId, user?.id],
    queryFn: async () => {
      const { data: course, error } = await supabase
        .from("academy_courses")
        .select("id, title, description, is_published")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      if (!course) return null;
      const { data: lessons } = await supabase
        .from("academy_lessons")
        .select("id, title, order_index")
        .eq("course_id", courseId)
        .order("order_index", { ascending: true });
      const lessonIds = (lessons ?? []).map((l) => l.id);
      const { data: quizzes } = lessonIds.length
        ? await supabase.from("academy_quizzes").select("id, lesson_id").in("lesson_id", lessonIds)
        : { data: [] };
      const quizByLesson: Record<string, string> = {};
      (quizzes ?? []).forEach((q) => { quizByLesson[q.lesson_id] = q.id; });

      const completedSet = new Set<string>();
      if (user?.id && lessonIds.length) {
        const { data: progress } = await supabase
          .from("academy_user_progress")
          .select("lesson_id, completed")
          .eq("user_id", user.id)
          .eq("course_id", courseId);
        (progress ?? []).forEach((p) => { if (p.completed) completedSet.add(p.lesson_id); });
      }
      return { course, lessons: lessons ?? [], quizByLesson, completedSet };
    },
  });

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>;
  if (!data || !data.course) {
    return (
      <div className="space-y-4 py-10 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">دوره یافت نشد.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/academy"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
        </Button>
      </div>
    );
  }

  const total = data.lessons.length;
  const done = data.lessons.filter((l) => data.completedSet.has(l.id)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.course.title}
        description={data.course.description ?? undefined}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/academy"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span>پیشرفت دوره</span>
            <span className="font-bold">{done} / {total} درس ({progress}%)</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {data.lessons.length === 0 ? (
          <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">درسی برای این دوره ثبت نشده است.</p>
        ) : data.lessons.map((l) => {
          const completed = data.completedSet.has(l.id);
          const hasQuiz = !!data.quizByLesson[l.id];
          return (
            <Link key={l.id} to="/academy/$courseId/$lessonId" params={{ courseId, lessonId: l.id }} className="block">
              <Card className="transition hover:border-primary hover:shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  {completed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{l.title}</div>
                  </div>
                  {hasQuiz && <Badge variant="outline"><FileQuestion className="ms-1 h-3 w-3" />آزمون</Badge>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}