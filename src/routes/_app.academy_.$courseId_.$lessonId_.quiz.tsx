import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, FileQuestion } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { QuizTaker, type TakerQuestion } from "@/shared/components/QuizTaker";

export const Route = createFileRoute("/_app/academy_/$courseId_/$lessonId_/quiz")({
  beforeLoad: async () => {
    await requirePermission("academy", "view");
  },
  component: QuizPage,
});

function QuizPage() {
  const { courseId, lessonId } = Route.useParams();
  const { user } = useAuth();
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["academy-quiz", lessonId],
    queryFn: async () => {
      const { data: quiz, error } = await supabase
        .from("academy_quizzes")
        .select("id, title, passing_score, lesson_id")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (error) throw error;
      if (!quiz) return null;
      const { data: questions } = await (supabase as any)
        .from("academy_quiz_questions_public")
        .select("id, question_text, options, order_index")
        .eq("quiz_id", quiz.id)
        .order("order_index", { ascending: true });
      return {
        quiz,
        questions: (questions ?? []) as Array<{
          id: string;
          question_text: string;
          options: unknown;
        }>,
      };
    },
  });

  const submitMutation = useMutation({
    mutationFn: async ({ answers }: { answers: Record<string, number> }) => {
      if (!user?.id || !data?.quiz) throw new Error("اطلاعات ناقص");
      const { data: res, error } = await supabase.rpc("submit_quiz_attempt" as any, {
        _quiz_id: data.quiz.id,
        _answers: answers as any,
      });
      if (error) throw error;
      const row = Array.isArray(res) ? (res[0] as any) : (res as any);
      return { score: row?.score ?? 0, passed: !!row?.passed };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(r.passed ? "آزمون با موفقیت ثبت شد" : "آزمون ثبت شد");
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ثبت آزمون"),
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
    );
  if (!data || !data.quiz) {
    return (
      <div className="space-y-4 py-10 text-center">
        <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">آزمونی برای این درس وجود ندارد.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/academy/$courseId/$lessonId" params={{ courseId, lessonId }}>
            <ArrowRight className="ms-1 h-4 w-4" />
            بازگشت
          </Link>
        </Button>
      </div>
    );
  }

  const takerQuestions: TakerQuestion[] = data.questions.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    options: Array.isArray(q.options) ? (q.options as { text: string }[]) : [],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.quiz.title || "آزمون درس"}
        description={`نمره قبولی: ${data.quiz.passing_score}٪`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/academy/$courseId/$lessonId" params={{ courseId, lessonId }}>
              <ArrowRight className="ms-1 h-4 w-4" />
              بازگشت به درس
            </Link>
          </Button>
        }
      />

      {takerQuestions.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          سؤالی برای این آزمون ثبت نشده است.
        </p>
      ) : (
        <QuizTaker
          key={attemptKey}
          questions={takerQuestions}
          passingScore={data.quiz.passing_score}
          submitting={submitMutation.isPending}
          result={result}
          onRetry={() => {
            setResult(null);
            setAttemptKey((k) => k + 1);
          }}
          onSubmit={async (p) => {
            await submitMutation.mutateAsync(p);
          }}
        />
      )}
    </div>
  );
}
