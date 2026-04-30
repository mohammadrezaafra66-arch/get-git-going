import { Sparkles } from "lucide-react";
import { MICardShell } from "./CardShell";

/** Placeholder for sections planned in upcoming phases. */
export function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <MICardShell
      title={title}
      description={description}
      icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        به‌زودی در فازهای بعدی این داشبورد فعال می‌شود.
      </div>
    </MICardShell>
  );
}