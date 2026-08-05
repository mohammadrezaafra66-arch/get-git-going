import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatReleaseNumber,
  formatReleasePublishedAt,
  shortSha,
} from "@/lib/platform-releases/format";
import type { PlatformRelease } from "@/lib/platform-releases/types";
import { toFaDigits } from "@/lib/i18n/formatters";

export function PlatformReleaseCard({ release }: { release: PlatformRelease }) {
  const [open, setOpen] = useState(false);
  const sha = shortSha(release.git_sha);
  const hasDetails = Boolean(release.details_fa?.trim()) || release.items.length > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-primary">
            {formatReleaseNumber(release.release_number)}
          </span>
          <Badge variant="secondary">{release.category}</Badge>
          {sha ? (
            <span
              className="font-mono text-xs text-muted-foreground"
              title={release.git_sha ?? undefined}
            >
              {sha}
            </span>
          ) : null}
          {release.version ? (
            <span className="text-xs text-muted-foreground">
              نسخه {toFaDigits(release.version)}
            </span>
          ) : null}
        </div>
        <CardTitle className="text-base leading-relaxed sm:text-lg">{release.title_fa}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{release.summary_fa}</p>
        <p className="text-xs text-muted-foreground" title={release.published_at ?? undefined}>
          {formatReleasePublishedAt(release.published_at)}
        </p>
      </CardHeader>
      {hasDetails ? (
        <CardContent className="space-y-3 pt-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <>
                <ChevronUp className="ms-1 h-4 w-4" />
                بستن جزئیات
              </>
            ) : (
              <>
                <ChevronDown className="ms-1 h-4 w-4" />
                مشاهده جزئیات
              </>
            )}
          </Button>
          {open ? (
            <div className="space-y-3 border-t pt-3">
              {release.details_fa?.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {release.details_fa}
                </p>
              ) : null}
              <ol className="list-decimal space-y-2 pe-5 text-sm leading-relaxed">
                {release.items.map((item) => (
                  <li key={item.item_number} className="ms-1">
                    <div className="font-medium">{item.title_fa}</div>
                    <div className="text-muted-foreground">{item.description_fa}</div>
                    {item.route_path && ROUTE_SAFE.test(item.route_path) ? (
                      <a
                        href={item.route_path}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        رفتن به صفحه
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

const ROUTE_SAFE = /^\/[A-Za-z0-9/_-]*$/;
