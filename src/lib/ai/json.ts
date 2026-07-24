/**
 * Helpers for coaxing JSON out of a chat completion.
 *
 * The old call sites asked the Lovable gateway for `response_format:
 * {type:"json_object"}`. That field is OpenAI-specific and Ollama's /api/chat
 * ignores it, so once a call can land on either provider the answer may arrive
 * wrapped in a ```json fence or padded with a sentence of preamble. Rather
 * than pin the callers to one provider, normalise here.
 */

/** Strips ``` fences and any prose around the outermost JSON object/array. */
export function stripJsonFence(text: string): string {
  let s = text.trim();

  // ```json ... ```  or  ``` ... ```
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(s);
  if (fence) s = fence[1].trim();

  // Some models still prepend a sentence. Take the outermost brace/bracket
  // span; JSON.parse remains the real validator, this only trims the edges.
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);

  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);

  return s.trim();
}
