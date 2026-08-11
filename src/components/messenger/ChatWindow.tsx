import { useState } from "react";
import { useMessengerMessages } from "@/hooks/messenger/useMessengerMessages";
import { useMessengerGroups } from "@/hooks/messenger/useMessengerGroups";
import { useGroupRole } from "@/hooks/messenger/useGroupRole";
import { useInquiries } from "@/hooks/messenger/useInquiries";
import { useAuth } from "@/lib/auth/AuthProvider";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { SemanticSearchBar } from "./SemanticSearchBar";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import { GroupMembersDialog } from "./GroupMembersDialog";
import { InquiryBoard, URGENT_STATUSES, inquiryBoardToPersianDigits } from "./InquiryBoard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, MessageSquare, ShoppingCart, Sparkles, Users } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"chat" | "inquiries">("chat");
  const { user, roles } = useAuth();
  const { data: myRole } = useGroupRole(groupId, user?.id ?? null);
  const isAdmin = myRole === "admin" || roles.includes("admin");
  const { data: inquiries } = useInquiries(groupId);
  const urgentCount = (inquiries ?? []).filter((i) => URGENT_STATUSES.has(i.status)).length;

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
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "chat" | "inquiries")}
        dir="rtl"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="sticky top-0 z-10 grid w-full grid-cols-2 rounded-none border-b bg-background">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            گفتگو
          </TabsTrigger>
          <TabsTrigger value="inquiries" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            استعلام‌ها
            {urgentCount > 0 && (
              <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-xs text-white">
                {inquiryBoardToPersianDigits(urgentCount)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          forceMount
        >
          <SemanticSearchBar groupId={groupId} />
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MessageList messages={messages ?? []} />
          )}
          <MessageComposer groupId={groupId} />
        </TabsContent>
        <TabsContent
          value="inquiries"
          className="mt-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
          forceMount
        >
          <InquiryBoard
            groupId={groupId}
            currentUserId={user?.id ?? null}
            active={activeTab === "inquiries"}
          />
        </TabsContent>
      </Tabs>
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