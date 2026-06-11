import { createFileRoute } from "@tanstack/react-router";
import { DailyMoodPage } from "@/components/operations/mood/DailyMoodPage";

export const Route = createFileRoute("/_app/operations/daily-mood")({
  component: DailyMoodPage,
});
