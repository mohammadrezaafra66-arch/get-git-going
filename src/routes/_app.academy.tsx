import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Settings2, BookOpen } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { BRANDING, getPageTitle } from "@/config/branding";

export const Route = createFileRoute("/_app/academy")({
  beforeLoad: async () => {
    await requirePermission("academy", "view");
  },
  head: () => ({ meta: [{ title: getPageTitle(`آکادمی ${BRANDING.platformName}`) }] }),
  component: AcademyListPage,
});

function AcademyListPage() {
  const { user, roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);

  const { data, isLoading } = useQuery({
    queryKey: ["academy-courses-list", user?.id],
    queryFn: async () => {
      const { data: courses, error } = await supabase
        .from("academy_courses")
        .select("id, title, description, is_published, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const courseIds = (courses ?? []).map((c) => c.id);
      if (courseIds.length === 0)
        return {
          courses: [],
          lessonsByCourse: {} as Record<string, number>,
          progressByCourse: {} as Record<string, number>,
        };

      const { data: lessons } = await supabase
        .from("academy_lessons")
        .select("id, course_id")
        .in("course_id", courseIds);
      const lessonsByCourse: Record<string, number> = {};
      const lessonIdsByCourse: Record<string, string[]> = {};
      (lessons ?? []).forEach((l) => {
        lessonsByCourse[l.course_id] = (lessonsByCourse[l.course_id] ?? 0) + 1;
        (lessonIdsByCourse[l.course_id] ??= []).push(l.id);
      });

      const progressByCourse: Record<string, number> = {};
      if (user?.id) {
        const { data: progress } = await supabase
          .from("academy_user_progress")
          .select("course_id, completed")
          .eq("user_id", user.id)
          .eq("completed", true)
          .in("course_id", courseIds);
        const completedByCourse: Record<string, number> = {};
        (progress ?? []).forEach((p) => {
          completedByCourse[p.course_id] = (completedByCourse[p.course_id] ?? 0) + 1;
        });
        courseIds.forEach((cid) => {
          const total = lessonsByCourse[cid] ?? 0;
          const done = completedByCourse[cid] ?? 0;
          progressByCourse[cid] = total > 0 ? Math.round((done / total) * 100) : 0;
        });
      }
      return { courses: courses ?? [], lessonsByCourse, progressByCourse };
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={`آکادمی ${BRANDING.platformName}`}
        description="دوره‌های آموزشی داخلی و آزمون‌ها"
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to="/academy/manage">
                <Settings2 className="ms-1 h-4 w-4" />
                مدیریت دوره‌ها
              </Link>
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : !data || data.courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="دوره‌ای یافت نشد"
          description="هنوز دوره منتشرشده‌ای وجود ندارد."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.courses.map((c) => {
            const lessonsCount = data.lessonsByCourse[c.id] ?? 0;
            const progress = data.progressByCourse[c.id] ?? 0;
            return (
              <Link
                key={c.id}
                to="/academy/$courseId"
                params={{ courseId: c.id }}
                className="block"
              >
                <Card className="h-full transition hover:border-primary hover:shadow-sm">
                  <CardHeader className="space-y-2 pb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        <BookOpen className="ms-1 h-3 w-3" />
                        {lessonsCount} درس
                      </Badge>
                      {progress === 100 && (
                        <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                          تکمیل شده
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-base leading-relaxed">{c.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {c.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>پیشرفت شما</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
