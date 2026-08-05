import { PlatformReleaseCard } from "./PlatformReleaseCard";
import type { PlatformRelease } from "@/lib/platform-releases/types";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

export function PlatformReleaseList({ releases }: { releases: PlatformRelease[] }) {
  if (releases.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="هنوز به‌روزرسانی ثبت نشده"
        description="پس از انتشار نسخه‌های جدید، فهرست تغییرات اینجا نمایش داده می‌شود."
      />
    );
  }
  return (
    <div className="space-y-4">
      {releases.map((r) => (
        <PlatformReleaseCard key={r.id} release={r} />
      ))}
    </div>
  );
}
