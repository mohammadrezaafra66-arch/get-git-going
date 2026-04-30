import { useCallback, useEffect, useState } from "react";
import {
  fetchMyTodayEntry, fetchScenarios, fetchQuestions, fetchRandomHafez,
  type MoodEntry, type Scenario, type Question, type HafezPoem, todayISO,
} from "@/lib/operations/daily-mood";

export function useDailyMood(userId: string | undefined) {
  const [entry, setEntry] = useState<MoodEntry | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [e, s] = await Promise.all([fetchMyTodayEntry(userId), fetchScenarios()]);
      setEntry(e);
      setScenarios(s);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);

  return { entry, setEntry, scenarios, loading, reload, today: todayISO() };
}

export function useScenarioQuestions(scenarioKey: string | null) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!scenarioKey) { setQuestions([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchQuestions(scenarioKey)
      .then((q) => { if (!cancelled) setQuestions(q); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scenarioKey]);
  return { questions, loading };
}

export function useHafez() {
  const [poem, setPoem] = useState<HafezPoem | null>(null);
  const [loading, setLoading] = useState(false);
  const draw = useCallback(async () => {
    setLoading(true);
    try { setPoem(await fetchRandomHafez()); } finally { setLoading(false); }
  }, []);
  return { poem, loading, draw, reset: () => setPoem(null) };
}