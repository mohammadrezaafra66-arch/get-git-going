import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useHafez } from "@/hooks/operations/useDailyMood";

export function HafezCard({
  saved,
  onToggleSave,
  onPicked,
}: {
  saved: boolean;
  onToggleSave: (saved: boolean, poemId: string | null) => void;
  onPicked?: (id: string) => void;
}) {
  const { poem, loading, draw, reset } = useHafez();

  return (
    <Card className="bg-gradient-to-br from-amber-50/60 to-rose-50/60 dark:from-amber-950/20 dark:to-rose-950/20 border-amber-200/50">
      <CardContent className="p-5 space-y-3" dir="rtl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> فال حافظ امروز
          </h3>
          {!poem && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void draw();
              }}
              disabled={loading}
            >
              {loading ? "…" : "گرفتن فال"}
            </Button>
          )}
        </div>
        {poem && (
          <div className="space-y-2">
            {poem.title && <p className="text-sm font-medium">{poem.title}</p>}
            <p className="whitespace-pre-line leading-loose text-foreground/90">{poem.poem_text}</p>
            {poem.interpretation && (
              <p className="text-sm text-muted-foreground border-t pt-2">{poem.interpretation}</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant={saved ? "default" : "outline"}
                onClick={() => {
                  onToggleSave(!saved, poem.id);
                  onPicked?.(poem.id);
                }}
              >
                {saved ? "ذخیره شد" : "ذخیره همراه ثبت امروز"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset();
                  onToggleSave(false, null);
                }}
              >
                فال جدید
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
