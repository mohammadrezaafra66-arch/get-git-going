import { useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function MessageComposer({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const send = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.rpc("send_messenger_message", {
        p_group_id: groupId,
        p_content: content,
        p_type: "text",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setValue("");
      qc.invalidateQueries({ queryKey: ["messenger-messages", groupId] });
      qc.invalidateQueries({ queryKey: ["messenger-groups"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطا در ارسال پیام";
      toast.error(msg);
    },
  });

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || send.isPending) return;
    send.mutate(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-card p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder="پیام خود را بنویسید… (Enter ارسال، Shift+Enter خط جدید)"
          className="min-h-10 resize-none"
        />
        <Button onClick={submit} disabled={!value.trim() || send.isPending} size="icon">
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}