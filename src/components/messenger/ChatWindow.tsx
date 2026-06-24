import { useMessengerMessages } from "@/hooks/messenger/useMessengerMessages";
import { useMessengerGroups } from "@/hooks/messenger/useMessengerGroups";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, MessageSquare } from "lucide-react";

export function ChatWindow({
  groupId,
  onBack,
}: {
  groupId: string | null;
  onBack?: () => void;
}) {
  const { data: groups } = useMessengerGroups();
  const { data: messages, isLoading } = useMessengerMessages(groupId);
  const group = groups?.find((g) => g.id === groupId) ?? null;

  if (!groupId || !group) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <MessageSquare className="h-10 w-10" />
        <p className="text-sm">یک گفت‌وگو از فهرست انتخاب کنید</p>
      </div>
    );
  }

  return (
    <section className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 border-b bg-card p-3">
        {onBack && (
          <Button size="icon" variant="ghost" onClick={onBack} className="md:hidden">
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <div className="flex flex-col">
          <span className="font-semibold">{group.name}</span>
          <span className="text-xs text-muted-foreground">{group.type}</span>
        </div>
      </header>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <MessageList messages={messages ?? []} />
      )}
      <MessageComposer groupId={groupId} />
    </section>
  );
}