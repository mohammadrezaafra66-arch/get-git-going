import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { NewGroupDialog } from "./NewGroupDialog";
import { useMessengerGroups, type MessengerGroup } from "@/hooks/messenger/useMessengerGroups";
import { formatJalaliRelative } from "@/lib/messenger/format";
import { MessageSquare, Loader2 } from "lucide-react";

const typeLabel: Record<string, string> = {
  private: "خصوصی",
  group: "گروهی",
  operational: "عملیاتی",
};

export function ConversationsSidebar({
  activeGroupId,
  onSelect,
}: {
  activeGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: groups, isLoading } = useMessengerGroups();

  return (
    <aside className="flex h-full w-full flex-col border-l bg-card md:max-w-sm">
      <header className="flex items-center justify-between border-b p-3">
        <h2 className="text-base font-semibold">گفت‌وگوها</h2>
        <NewGroupDialog onCreated={(id) => onSelect(id)} />
      </header>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">هنوز گروهی ندارید</p>
            <p className="text-xs">با دکمه «گروه جدید» شروع کنید</p>
          </div>
        ) : (
          <ul className="divide-y">
            {groups.map((g: MessengerGroup) => {
              const active = g.id === activeGroupId;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(g.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 p-3 text-right transition-colors hover:bg-accent/50",
                      active && "bg-accent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{g.name}</span>
                      <div className="flex items-center gap-1">
                        {g.unread_count > 0 && (
                          <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs">
                            {g.unread_count}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {typeLabel[g.type] ?? g.type}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{g.last_message?.content ?? "بدون پیام"}</span>
                      <span className="shrink-0" dir="ltr">
                        {g.last_message?.created_at ? formatJalaliRelative(g.last_message.created_at) : ""}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}