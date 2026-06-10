import { supabase } from "@/integrations/supabase/client";

export type MoodKey =
  | "great" | "good" | "ok" | "tired" | "sad"
  | "angry" | "low_energy" | "hopeful" | "anxious" | "upset";

export const MOODS: Array<{ key: MoodKey; label: string; emoji: string; score: number }> = [
  { key: "great",      label: "خیلی خوب",   emoji: "😄", score: 5 },
  { key: "good",       label: "خوب",        emoji: "🙂", score: 4 },
  { key: "hopeful",    label: "امیدوار",    emoji: "🌱", score: 4 },
  { key: "ok",         label: "معمولی",     emoji: "😐", score: 3 },
  { key: "tired",      label: "خسته",       emoji: "😴", score: 2 },
  { key: "low_energy", label: "بی‌انرژی",   emoji: "🥱", score: 2 },
  { key: "anxious",    label: "مضطرب",      emoji: "😰", score: 2 },
  { key: "sad",        label: "ناراحت",     emoji: "😢", score: 1 },
  { key: "upset",      label: "دلخور",      emoji: "😞", score: 1 },
  { key: "angry",      label: "عصبی",       emoji: "😠", score: 1 },
];

export const REASONS: string[] = [
  "کار زیاد", "برخورد با مشتری", "همکاری تیمی", "فشار مالی",
  "مشکل خانوادگی", "موفقیت کاری", "یادگیری چیز جدید", "خستگی جسمی",
  "ابهام در کار", "اتفاق خوب", "اتفاق ناراحت‌کننده", "ترجیح می‌دهم نگویم",
];

export type FollowUp = "no" | "later" | "seen" | "important";
export const FOLLOW_UP_OPTIONS: Array<{ value: FollowUp; label: string }> = [
  { value: "no",        label: "نه، فقط ثبت شود" },
  { value: "later",     label: "بله، بهتر است بعداً صحبت کنیم" },
  { value: "seen",      label: "فوری نیست، ولی دوست دارم دیده شود" },
  { value: "important", label: "موضوع مهم است و نیاز به بررسی دارد" },
];

export type EntryStatus = "new" | "seen" | "follow_up_needed" | "in_review" | "resolved" | "archived";
export const STATUS_LABELS: Record<EntryStatus, string> = {
  new: "جدید",
  seen: "دیده‌شد",
  follow_up_needed: "نیاز به پیگیری",
  in_review: "در حال بررسی",
  resolved: "رسیدگی‌شده",
  archived: "بایگانی",
};

export type Scenario = {
  id: string;
  scenario_key: string;
  title: string;
  mood_keys: string[];
  is_active: boolean;
  sort_order: number;
};

export type Question = {
  id: string;
  scenario_key: string;
  question_key: string;
  question_text: string;
  question_type: "single_choice" | "multi_choice" | "scale" | "text_optional";
  options: unknown;
  sort_order: number;
  is_active: boolean;
};

export type HafezPoem = {
  id: string;
  title: string | null;
  poem_text: string;
  interpretation: string | null;
};

export type MoodEntry = {
  id: string;
  user_id: string;
  mood_date: string;
  mood_key: string;
  mood_label: string;
  mood_score: number | null;
  reasons: string[];
  scenario_key: string | null;
  answers: Array<{ question_key: string; question_text: string; value: unknown }>;
  free_text: string | null;
  wants_follow_up: FollowUp;
  hafez_poem_id: string | null;
  hafez_saved: boolean;
  status: EntryStatus;
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function pickScenarioForMood(scenarios: Scenario[], moodKey: string): Scenario | null {
  const matches = scenarios.filter((s) => s.is_active && s.mood_keys.includes(moodKey));
  if (matches.length > 0) return matches.sort((a, b) => a.sort_order - b.sort_order)[0];
  return scenarios.find((s) => s.scenario_key === "ok") ?? null;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from("daily_mood_scenarios")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Scenario[];
}

export async function fetchQuestions(scenarioKey: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from("daily_mood_questions")
    .select("*")
    .eq("scenario_key", scenarioKey)
    .eq("is_active", true)
    .order("sort_order")
    .limit(7);
  if (error) throw error;
  return (data ?? []) as Question[];
}

export async function fetchRandomHafez(): Promise<HafezPoem | null> {
  const { data, error } = await supabase
    .from("daily_mood_hafez_poems")
    .select("id,title,poem_text,interpretation")
    .eq("is_active", true)
    .limit(20);
  if (error) throw error;
  const list = (data ?? []) as HafezPoem[];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export async function fetchMyTodayEntry(userId: string): Promise<MoodEntry | null> {
  const { data, error } = await supabase
    .from("daily_mood_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("mood_date", todayISO())
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MoodEntry | null) ?? null;
}

export async function upsertTodayEntry(
  userId: string,
  payload: Partial<MoodEntry> & { mood_key: string; mood_label: string },
): Promise<MoodEntry> {
  const row = {
    user_id: userId,
    mood_date: todayISO(),
    mood_key: payload.mood_key,
    mood_label: payload.mood_label,
    mood_score: payload.mood_score ?? null,
    reasons: payload.reasons ?? [],
    scenario_key: payload.scenario_key ?? null,
    answers: payload.answers ?? [],
    free_text: payload.free_text ?? null,
    wants_follow_up: payload.wants_follow_up ?? "no",
    hafez_poem_id: payload.hafez_poem_id ?? null,
    hafez_saved: payload.hafez_saved ?? false,
  };
  const { data, error } = await supabase
    .from("daily_mood_entries")
    .upsert(row as never, { onConflict: "user_id,mood_date" })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as MoodEntry;
}

export async function fetchAdminEntries(params: {
  page: number;
  pageSize: number;
  search?: string;
  moodKey?: string;
  status?: string;
  followUp?: string;
  date?: string;
}): Promise<{ rows: MoodEntry[]; total: number }> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  let q = supabase
    .from("daily_mood_entries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (params.moodKey) q = q.eq("mood_key", params.moodKey);
  if (params.status) q = q.eq("status", params.status);
  if (params.followUp) q = q.eq("wants_follow_up", params.followUp);
  if (params.date) q = q.eq("mood_date", params.date);
  if (params.search) q = q.ilike("free_text", `%${params.search}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as MoodEntry[], total: count ?? 0 };
}

export async function updateEntryStatus(id: string, status: EntryStatus, reviewerId: string) {
  const { error } = await supabase
    .from("daily_mood_entries")
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateManagerNote(id: string, note: string, reviewerId: string) {
  const trimmed = note.slice(0, 2000);
  const { error } = await supabase
    .from("daily_mood_entries")
    .update({ manager_note: trimmed, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}