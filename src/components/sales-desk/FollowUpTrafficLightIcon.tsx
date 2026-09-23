import { Circle } from "lucide-react";

import type { FollowUpTrafficLight } from "@/lib/sales-desk/activities";

const COLOR: Record<FollowUpTrafficLight, string> = {
  yellow: "text-amber-400 fill-amber-400",
  red: "text-red-500 fill-red-500",
  green: "text-emerald-500 fill-emerald-500",
  grey: "text-slate-400 fill-slate-400",
};

const TITLE: Record<FollowUpTrafficLight, string> = {
  yellow: "فعالیتی برنامه‌ریزی نشده",
  red: "فعالیت عقب‌افتاده",
  green: "فعالیت امروز",
  grey: "فعالیت آینده",
};

export function FollowUpTrafficLightIcon({
  light,
  className = "h-3.5 w-3.5",
}: {
  light: FollowUpTrafficLight;
  className?: string;
}) {
  return (
    <span title={TITLE[light]} aria-label={TITLE[light]} className="inline-flex">
      <Circle className={`${className} ${COLOR[light]}`} aria-hidden />
    </span>
  );
}
