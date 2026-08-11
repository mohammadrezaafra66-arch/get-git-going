import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Copy, Loader2, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { generateAdCopy, type AdCopyVariation } from "@/lib/ai-tools/ad-copy.functions";

type Audience = "wholesale" | "retail" | "general";

const STYLE_LABELS = ["رسمی و حرفه‌ای", "دوستانه و گرم", "فوری و متقاعدکننده"];

type Props = {
  productId: string;
  productName: string;
  category?: string | null;
  brand?: string | null;
  price?: number | null;
  description?: string | null;
};

export function AdCopyGenerator({
  productId,
  productName,
  category,
  brand,
  price,
  description,
}: Props) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("general");
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<AdCopyVariation[]>([]);
  const [edits, setEdits] = useState<Record<number, AdCopyVariation>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const callAdCopy = useServerFn(generateAdCopy);

  async function handleGenerate() {
    setLoading(true);
    setVariations([]);
    setEdits({});
    try {
      const result = await callAdCopy({
        data: {
          productId,
          productName,
          category: category ?? null,
          brand: brand ?? null,
          price: price ?? null,
          description: description ?? null,
          audience,
        },
      });
      setVariations(result.variations);
    } catch (err: any) {
      toast.error(err?.message ?? "خطا در تولید کپی تبلیغاتی");
    } finally {
      setLoading(false);
    }
  }

  function getCurrent(i: number): AdCopyVariation {
    return edits[i] ?? variations[i];
  }

  function updateField(i: number, field: keyof AdCopyVariation, value: string) {
    setEdits((prev) => ({
      ...prev,
      [i]: { ...getCurrent(i), [field]: value },
    }));
  }

  async function handleCopy(i: number) {
    const v = getCurrent(i);
    const text = `${v.headline}\n\n${v.body}\n\n${v.cta}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      toast.success("متن کپی شد");
      setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1500);
    } catch {
      toast.error("کپی نشد");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="ms-1 h-4 w-4" />
          تولید کپی تبلیغاتی با AI
          <Badge variant="secondary" className="ms-2">AI</Badge>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>کپی تبلیغاتی هوشمند</SheetTitle>
          <SheetDescription>
            سه نسخه متفاوت برای «{productName}» تولید می‌شود.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>مخاطب هدف</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">عمومی</SelectItem>
                <SelectItem value="wholesale">عمده‌فروشی</SelectItem>
                <SelectItem value="retail">خرده‌فروشی</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                در حال تولید...
              </>
            ) : variations.length > 0 ? (
              <>
                <RefreshCw className="ms-1 h-4 w-4" />
                تولید مجدد
              </>
            ) : (
              <>
                <Sparkles className="ms-1 h-4 w-4" />
                تولید کپی
              </>
            )}
          </Button>

          {variations.length > 0 && (
            <div className="space-y-3">
              {variations.map((_, i) => {
                const v = getCurrent(i);
                return (
                  <Card key={i}>
                    <CardContent className="space-y-3 p-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">
                          نسخه {i + 1} — {STYLE_LABELS[i] ?? ""}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(i)}
                        >
                          {copiedIdx === i ? (
                            <Check className="ms-1 h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="ms-1 h-4 w-4" />
                          )}
                          کپی
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">تیتر</Label>
                        <Textarea
                          value={v.headline}
                          onChange={(e) => updateField(i, "headline", e.target.value)}
                          rows={1}
                          className="resize-none font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">متن</Label>
                        <Textarea
                          value={v.body}
                          onChange={(e) => updateField(i, "body", e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">دعوت به اقدام</Label>
                        <Textarea
                          value={v.cta}
                          onChange={(e) => updateField(i, "cta", e.target.value)}
                          rows={1}
                          className="resize-none"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
