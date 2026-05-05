import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface TakerQuestion {
  id: string;
  question_text: string;
  options: { text: string }[];
}

interface Props {
  questions: TakerQuestion[];
  passingScore: number;
  submitting?: boolean;
  onSubmit: (payload: { answers: Record<string, number> }) => Promise<void> | void;
  /** نتیجه آزمون اخیر (برای نمایش پس از ثبت) */
  result?: { score: number; passed: boolean } | null;
  onRetry?: () => void;
}

export function QuizTaker({ questions, passingScore, submitting, onSubmit, result, onRetry }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (Object.keys(answers).length < questions.length) {
      setError("لطفاً به همه سؤالات پاسخ دهید");
      return;
    }
    await onSubmit({ answers });
  };

  if (result) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          {result.passed ? (
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          ) : (
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
          )}
          <div className="text-2xl font-bold">{result.score}%</div>
          <p className={result.passed ? "text-emerald-700" : "text-destructive"}>
            {result.passed ? "تبریک! شما در آزمون قبول شدید." : `متأسفانه قبول نشدید (حد قبولی: ${passingScore}٪).`}
          </p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline">تلاش مجدد</Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-4">
      {questions.map((q, qIdx) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 p-4">
            <Label className="block text-sm font-bold">{qIdx + 1}. {q.question_text}</Label>
            <div className="space-y-2">
              {q.options.map((opt, oIdx) => (
                <label key={oIdx} className="flex cursor-pointer items-center gap-2 rounded border p-2 hover:bg-muted">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === oIdx}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: oIdx }))}
                  />
                  <span className="text-sm">{opt.text}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          ثبت پاسخ‌ها
        </Button>
      </div>
    </form>
  );
}