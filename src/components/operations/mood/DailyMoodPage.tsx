import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDailyMood } from "@/hooks/operations/useDailyMood";
import {
  MOODS, FOLLOW_UP_OPTIONS, pickScenarioForMood, upsertTodayEntry,
  type FollowUp, type MoodKey,
} from "@/lib/operations/daily-mood";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MoodEmojiSelector } from "./MoodEmojiSelector";
import { MoodReasonSelector } from "./MoodReasonSelector";
import { MoodScenarioFlow } from "./MoodScenarioFlow";
import { HafezCard } from "./HafezCard";

const STEPS = ["حال امروز", "دلایل", "گفت‌وگوی کوتاه", "نوشته آزاد", "پیگیری", "فال حافظ", "ثبت"] as const;

export function DailyMoodPage() {
  const { user } = useAuth();
  const { entry, setEntry, scenarios, loading } = useDailyMood(user?.id);

  const [step, setStep] = useState(0);
  const [moodKey, setMoodKey] = useState<MoodKey | null>(null);
  const [moodLabel, setMoodLabel] = useState<string>("");
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Array<{ question_key: string; question_text: string; value: unknown }>>([]);
  const [freeText, setFreeText] = useState("");
  const [followUp, setFollowUp] = useState<FollowUp>("no");
  const [hafezSaved, setHafezSaved] = useState(false);
  const [hafezId, setHafezId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scenarioKey = useMemo(() => {
    if (!moodKey) return null;
    return pickScenarioForMood(scenarios, moodKey)?.scenario_key ?? null;
  }, [moodKey, scenarios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (entry) {
    const moodMeta = MOODS.find((m) => m.key === entry.mood_key);
    return (
      <div className="container max-w-3xl py-8 space-y-6" dir="rtl">
        <PageHeader title="حال‌وهوای امروز" description="ثبت امروزت ذخیره شده. ممنون که با ما در میون گذاشتی." />
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{moodMeta?.emoji ?? "🙂"}</span>
              <div>
                <p className="font-semibold">{entry.mood_label}</p>
                <p className="text-xs text-muted-foreground">{entry.mood_date}</p>
              </div>
            </div>
            {entry.reasons.length > 0 && (
              <p className="text-sm text-muted-foreground">دلایل: {entry.reasons.join("، ")}</p>
            )}
            {entry.free_text && <p className="text-sm leading-loose">{entry.free_text}</p>}
            <p className="text-xs text-muted-foreground">برای امروز فقط یک ثبت قابل ذخیره است؛ از فردا می‌توانی دوباره بنویسی.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canNext = (() => {
    if (step === 0) return !!moodKey;
    return true;
  })();

  const submit = async () => {
    if (!user || !moodKey) return;
    setSubmitting(true);
    try {
      const saved = await upsertTodayEntry(user.id, {
        mood_key: moodKey,
        mood_label: moodLabel,
        mood_score: moodScore,
        reasons,
        scenario_key: scenarioKey,
        answers,
        free_text: freeText.trim() ? freeText.trim().slice(0, 2000) : null,
        wants_follow_up: followUp,
        hafez_saved: hafezSaved,
        hafez_poem_id: hafezSaved ? hafezId : null,
      });
      setEntry(saved);
      toast.success("ممنون که حال امروزت رو با ما در میون گذاشتی.");
    } catch (e) {
      toast.error((e as Error).message || "خطا در ثبت");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6" dir="rtl">
      <PageHeader
        title="امروز حالت چطوره؟"
        description="اینجا جاییه برای گفتن چیزهایی که شاید توی شلوغی روز فرصت گفتنش نباشه."
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>گام {step + 1} از {STEPS.length} — {STEPS[step]}</span>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {step === 0 && (
            <MoodEmojiSelector
              value={moodKey}
              onChange={(k, l, s) => { setMoodKey(k); setMoodLabel(l); setMoodScore(s); }}
            />
          )}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">می‌خوای کمی بیشتر برامون بگی چه چیزهایی روی حالت اثر گذاشت؟ (چندتا انتخاب کن)</p>
              <MoodReasonSelector value={reasons} onChange={setReasons} />
            </div>
          )}
          {step === 2 && scenarioKey && (
            <MoodScenarioFlow scenarioKey={scenarioKey} value={answers} onChange={setAnswers} />
          )}
          {step === 3 && (
            <div className="space-y-2">
              <label className="text-sm">اگر دوست داری، چند خط بیشتر برامون بنویس… <span className="text-muted-foreground">(اختیاری، حداکثر ۲۰۰۰ نویسه)</span></label>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value.slice(0, 2000))}
                className="w-full rounded-lg border bg-card p-3 text-sm min-h-32"
                placeholder="همین که گفتی، ارزشمنده."
              />
              <p className="text-xs text-muted-foreground text-left">{freeText.length}/2000</p>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm">آیا دوست داری مدیریت این موضوع را پیگیری کند؟</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {FOLLOW_UP_OPTIONS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setFollowUp(o.value)}
                    className={`rounded-xl border px-4 py-3 text-sm text-right ${followUp === o.value ? "bg-primary/10 border-primary" : "bg-card hover:bg-accent"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">قرار نیست قضاوتت کنیم؛ فقط می‌خوایم بهتر بشنویمت.</p>
            </div>
          )}
          {step === 5 && (
            <HafezCard
              saved={hafezSaved}
              onToggleSave={(s, id) => { setHafezSaved(s); setHafezId(id); }}
            />
          )}
          {step === 6 && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="font-semibold">آماده ثبت هستیم</p>
              <p className="text-sm text-muted-foreground">با ثبت این فرم، حال امروزت برای امروز ذخیره می‌شود.</p>
              <Button onClick={() => void submit()} disabled={submitting} size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                ثبت نهایی
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {step < STEPS.length - 1 && (
        <div className="flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>قبلی</Button>
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canNext}>بعدی</Button>
        </div>
      )}
    </div>
  );
}