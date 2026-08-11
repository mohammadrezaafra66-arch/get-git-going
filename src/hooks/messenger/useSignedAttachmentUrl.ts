import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EXPIRES_IN_SECONDS = 3600;

export function useSignedAttachmentUrl(filePath: string | null | undefined) {
  return useQuery({
    queryKey: ["messenger-attachment-url", filePath],
    enabled: !!filePath,
    // expiry سرور 1h است، کش 50m تا قبل از انقضا refresh شود
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async (): Promise<string> => {
      if (!filePath) throw new Error("no path");
      const { data, error } = await supabase.storage
        .from("messenger-attachments")
        .createSignedUrl(filePath, EXPIRES_IN_SECONDS);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "خطا در دریافت لینک فایل");
      }
      return data.signedUrl;
    },
  });
}
