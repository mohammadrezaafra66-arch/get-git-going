import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { ConversationsSidebar } from "@/components/messenger/ConversationsSidebar";
import { ChatWindow } from "@/components/messenger/ChatWindow";
import { cn } from "@/lib/utils";

function MessagesPage() {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  return (
    <div dir="rtl" className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-background">
      <div className={cn("h-full w-full md:w-[22rem] md:shrink-0", activeGroupId && "hidden md:block")}>
        <ConversationsSidebar activeGroupId={activeGroupId} onSelect={setActiveGroupId} />
      </div>
      <div className={cn("h-full flex-1 flex-col", activeGroupId ? "flex" : "hidden md:flex")}>
        <ChatWindow groupId={activeGroupId} onBack={() => setActiveGroupId(null)} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/messages")({
  beforeLoad: async () => {
    await requirePermission("messages", "view");
  },
  component: MessagesPage,
});
