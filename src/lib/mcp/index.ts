import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";

// The OAuth issuer MUST be the direct Supabase host. `VITE_SUPABASE_PROJECT_ID`
// is inlined by Vite at build time. The fallback keeps the issuer well-formed
// during the throwaway manifest-extract eval; the published build inlines the
// real ref, and a token will never verify against the sentinel.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "afrakala-mcp",
  title: "AfraKala MCP",
  version: "0.1.0",
  instructions:
    "Agent integration for AfraKala. Use `whoami` to verify the connected user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool],
});