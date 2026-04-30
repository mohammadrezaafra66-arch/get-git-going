import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  /** متن کوچک زیر عنوان که توضیح می‌دهد شاخص چگونه محاسبه شده. */
  rule?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function MICardShell({ title, description, rule, icon, actions, children }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            {icon}
            {title}
          </CardTitle>
          {actions}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {rule && (
          <p className="flex items-start gap-1 text-[11px] text-muted-foreground/80">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{rule}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}