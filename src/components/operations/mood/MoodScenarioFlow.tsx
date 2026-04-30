import { useEffect, useState } from "react";
import { useScenarioQuestions } from "@/hooks/operations/useDailyMood";
import type { Question } from "@/lib/operations/daily-mood";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Answer = { question_key: string; question_text: string; value: unknown };

export function MoodScenarioFlow({
  scenarioKey, value, onChange,
}: {
  scenarioKey: string;
  value: Answer[];
  onChange: (next: Answer[]) => void;
}) {
  const { questions, loading } = useScenarioQuestions(scenarioKey);
  const [step, setStep] = useState(0);

  useEffect(() => { setStep(0); }, [scenarioKey]);

  if (loading) return <p className="text-muted-foreground text-sm">در حال بارگذاری…</p>;
  if (questions.length === 0) return <p className="text-muted-foreground text-sm">سؤالی برای این حال در دسترس نیست.</p>;

  const q = questions[Math.min(step, questions.length - 1)];
  const existing = value.find((a) => a.question_key === q.question_key);

  const setAnswer = (val: unknown) => {
    const next = value.filter((a) => a.question_key !== q.question_key);
    next.push({ question_key: q.question_key, question_text: q.question_text, value: val });
    onChange(next);
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>سؤال {step + 1} از {questions.length}</span>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <span key={i} className={cn("h-1.5 w-6 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>
      <h3 className="text-lg font-semibold">{q.question_text}</h3>
      <QuestionInput q={q} value={existing?.value} onChange={setAnswer} />
      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>قبلی</Button>
        <Button variant="outline" size="sm" disabled={step >= questions.length - 1} onClick={() => setStep((s) => Math.min(questions.length - 1, s + 1))}>بعدی</Button>
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  const opts = (q.options ?? []) as Array<string | { value: number; label: string }>;
  if (q.question_type === "single_choice") {
    return (
      <div className="grid sm:grid-cols-2 gap-2">
        {(opts as string[]).map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={cn("rounded-xl border px-4 py-3 text-sm text-right transition-colors",
              value === opt ? "bg-primary/10 border-primary" : "bg-card hover:bg-accent")}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (q.question_type === "multi_choice") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
    return (
      <div className="flex flex-wrap gap-2">
        {(opts as string[]).map((opt) => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={cn("rounded-full border px-3 py-1.5 text-sm",
              arr.includes(opt) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent")}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (q.question_type === "scale") {
    return (
      <div className="flex gap-2 flex-wrap">
        {(opts as Array<{ value: number; label: string }>).map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={cn("rounded-lg border px-3 py-2 text-sm flex flex-col items-center min-w-16",
              value === o.value ? "bg-primary/10 border-primary" : "bg-card hover:bg-accent")}>
            <span className="font-bold">{o.value}</span>
            <span className="text-xs text-muted-foreground">{o.label}</span>
          </button>
        ))}
      </div>
    );
  }
  // text_optional
  return (
    <textarea
      maxLength={500}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="اگر دوست داری چند کلمه بنویس… (اختیاری)"
      className="w-full rounded-lg border bg-card p-3 text-sm min-h-20"
    />
  );
}