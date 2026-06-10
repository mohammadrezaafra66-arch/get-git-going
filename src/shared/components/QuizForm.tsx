import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export interface QuizQuestion {
  id?: string;
  question_text: string;
  options: { text: string }[];
  correct_value: number;
  order_index: number;
}

export interface QuizFormValues {
  title: string;
  passing_score: number;
  questions: QuizQuestion[];
}

interface Props {
  defaultValues?: Partial<QuizFormValues>;
  onSubmit: (values: QuizFormValues) => Promise<void> | void;
  submitting?: boolean;
  onCancel?: () => void;
}

export function QuizForm({ defaultValues, onSubmit, submitting, onCancel }: Props) {
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [passingScore, setPassingScore] = useState(defaultValues?.passing_score ?? 50);
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    defaultValues?.questions && defaultValues.questions.length > 0
      ? defaultValues.questions
      : [
          {
            question_text: "",
            options: [{ text: "" }, { text: "" }],
            correct_value: 0,
            order_index: 0,
          },
        ],
  );
  const [error, setError] = useState<string | null>(null);

  const addQuestion = () => {
    setQuestions((q) => [
      ...q,
      {
        question_text: "",
        options: [{ text: "" }, { text: "" }],
        correct_value: 0,
        order_index: q.length,
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((q) => q.filter((_, i) => i !== idx).map((qq, i) => ({ ...qq, order_index: i })));
  };

  const updateQuestion = (idx: number, patch: Partial<QuizQuestion>) => {
    setQuestions((q) => q.map((qq, i) => (i === idx ? { ...qq, ...patch } : qq)));
  };

  const addOption = (qIdx: number) => {
    setQuestions((q) =>
      q.map((qq, i) => (i === qIdx ? { ...qq, options: [...qq.options, { text: "" }] } : qq)),
    );
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions((q) =>
      q.map((qq, i) => {
        if (i !== qIdx) return qq;
        const newOptions = qq.options.filter((_, j) => j !== oIdx);
        const newCorrect = qq.correct_value >= newOptions.length ? 0 : qq.correct_value;
        return { ...qq, options: newOptions, correct_value: newCorrect };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passingScore < 0 || passingScore > 100) {
      setError("نمره قبولی باید بین ۰ تا ۱۰۰ باشد");
      return;
    }
    if (questions.length < 1) {
      setError("حداقل یک سؤال لازم است");
      return;
    }
    for (const q of questions) {
      if (!q.question_text.trim()) {
        setError("متن همه سؤالات الزامی است");
        return;
      }
      if (q.options.length < 2) {
        setError("هر سؤال باید حداقل ۲ گزینه داشته باشد");
        return;
      }
      if (q.options.some((o) => !o.text.trim())) {
        setError("متن همه گزینه‌ها الزامی است");
        return;
      }
    }
    await onSubmit({ title: title.trim(), passing_score: passingScore, questions });
  };

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>عنوان آزمون</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="عنوان آزمون (اختیاری)"
          />
        </div>
        <div className="space-y-1.5">
          <Label>نمره قبولی (٪)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, qIdx) => (
          <Card key={qIdx}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-bold">سؤال {qIdx + 1}</Label>
                {questions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuestion(qIdx)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <Input
                value={q.question_text}
                onChange={(e) => updateQuestion(qIdx, { question_text: e.target.value })}
                placeholder="متن سؤال"
              />
              <div className="space-y-2">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`q-${qIdx}-correct`}
                      checked={q.correct_value === oIdx}
                      onChange={() => updateQuestion(qIdx, { correct_value: oIdx })}
                      aria-label={`گزینه صحیح ${oIdx + 1}`}
                    />
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const newOptions = q.options.map((o, j) =>
                          j === oIdx ? { text: e.target.value } : o,
                        );
                        updateQuestion(qIdx, { options: newOptions });
                      }}
                      placeholder={`گزینه ${oIdx + 1}`}
                      className="flex-1"
                    />
                    {q.options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(qIdx, oIdx)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIdx)}>
                  <Plus className="ms-1 h-4 w-4" />
                  افزودن گزینه
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" onClick={addQuestion}>
          <Plus className="ms-1 h-4 w-4" />
          افزودن سؤال
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          ذخیره آزمون
        </Button>
      </div>
    </form>
  );
}
