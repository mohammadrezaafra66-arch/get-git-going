import { useState } from "react";
import { useMessengerMessages } from "@/hooks/messenger/useMessengerMessages";
import { useMessengerGroups } from "@/hooks/messenger/useMessengerGroups";
import { useGroupRole } from "@/hooks/messenger/useGroupRole";
import { useAuth } from "@/lib/auth/AuthProvider";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { SemanticSearchBar } from "./SemanticSearchBar";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import { GroupMembersDialog } from "./GroupMembersDialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, MessageSquare, Sparkles, Users } from "lucide-react";

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
  const [aiOpen, setAiOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const { user } = useAuth();
  const { data: myRole } = useGroupRole(groupId, user?.id ?? null);
  const isAdmin = myRole === "admin";

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
        <div className="flex flex-1 flex-col">
          <span className="font-semibold">{group.name}</span>
          <span className="text-xs text-muted-foreground">{group.type}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setAiOpen(true)}
          aria-label="دستیار هوشمند"
          title="دستیار هوشمند"
        >
          <Sparkles className="h-4 w-4 text-primary" />
        </Button>
        {isAdmin && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMembersOpen(true)}
            aria-label="مدیریت اعضا"
            title="مدیریت اعضا"
          >
            <Users className="h-4 w-4" />
          </Button>
        )}
      </header>
      <SemanticSearchBar groupId={groupId} />
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <MessageList messages={messages ?? []} />
      )}
      <MessageComposer groupId={groupId} />
      <AiAssistantDrawer open={aiOpen} onOpenChange={setAiOpen} groupId={groupId} />
      {groupId && (
        <GroupMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          groupId={groupId}
          currentUserId={user?.id ?? null}
          isAdmin={isAdmin}
        />
      )}
    </section>
  );
}