import { Link } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type ImportPath = "asan" | "didar";

/**
 * Cross-links the two person-import workbenches. City/province travel on both
 * files; the pages stay separate because Asan requires a code and Didar forbids one.
 */
export function ImportPathButtons({ current }: { current: ImportPath }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant={current === "didar" ? "default" : "outline"} size="sm">
        <Link to="/admin/didar-import">ورود اشخاص از دیدار</Link>
      </Button>
      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      <Button asChild variant={current === "asan" ? "default" : "outline"} size="sm">
        <Link to="/admin/asan-import">ورود اطلاعات از آسان</Link>
      </Button>
    </div>
  );
}
