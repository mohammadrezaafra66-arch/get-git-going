import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askKnowledge, type AskResult } from "@/lib/knowledge/rag.functions";

/**
 * Question box, deliberately INSIDE /knowledge rather than on its own route:
 * asking a question and browsing the documents are the same task, and the
 * plain-text title search above it keeps working untouched.
 */
export function KnowledgeAskBox() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);

  const askM = useMutation({
    mutationFn: (q: string) => askKnowledge({ data: { question: q } }),
    onSuccess: (r) => setResult(r),
    onError: (e) =>
      setResult({
        ok: false,
        answer: e instanceof Error ? e.message : "خطا در پاسخ‌گویی.",
        sources: [],
        noContext: true,
      }),
  });

  const canAsk = question.trim().length >= 3 && !askM.isPending;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          پرسش از اسناد
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAsk) askM.mutate(question.trim());
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="سؤالتان را بپرسید؛ پاسخ فقط از روی اسناد ثبت‌شده ساخته می‌شود."
          />
          <Button type="submit" disabled={!canAsk}>
            {askM.isPending ? (
              <Loader2 className="ms-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="ms-1 h-4 w-4" />
            )}
            بپرس
          </Button>
        </form>

        {result && (
          <div className="space-y-2">
            <Alert>
              <AlertDescription className="whitespace-pre-wrap text-sm leading-7">
                {result.answer}
              </AlertDescription>
            </Alert>

            {result.sources.length > 0 && (
              <div className="space-y-1 text-xs">
                <div className="text-muted-foreground">منابع:</div>
                <ul className="space-y-1">
                  {result.sources.map((s) => (
                    <li key={`${s.documentId}-${s.chunkIndex}`}>
                      <Link
                        to="/knowledge/$documentId"
                        params={{ documentId: s.documentId }}
                        className="text-primary underline underline-offset-4"
                      >
                        {s.title}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        (بخش {s.chunkIndex + 1} — شباهت {Math.round(s.similarity * 100)}٪)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
