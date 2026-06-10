/**
 * Lightweight HTML sanitizer with a strict allowlist.
 * Browser: uses native DOMParser.
 * SSR / non-browser: falls back to a regex-based stripper that keeps text only.
 *
 * این جایگزین `isomorphic-dompurify` است تا وابستگی سنگین `jsdom`
 * از bundle و SSR worker حذف شود (هم برای Lovable preview هم برای
 * self-host روی Linux + Docker).
 */

const ALLOWED_TAGS = new Set([
  "a",
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "mark",
  "small",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "figure",
  "figcaption",
  "span",
  "div",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
};

const SAFE_URL_PREFIX = /^(https?:|mailto:|tel:|\/|#)/i;

function sanitizeAttr(tag: string, name: string, value: string): string | null {
  const lname = name.toLowerCase();
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed?.has(lname)) return null;
  if ((tag === "a" && lname === "href") || (tag === "img" && lname === "src")) {
    if (!SAFE_URL_PREFIX.test(value.trim())) return null;
  }
  return value;
}

function walk(node: Element, doc: Document): void {
  // Iterate over a static copy because we mutate children.
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Replace disallowed element with its text content.
      const text = doc.createTextNode(child.textContent ?? "");
      child.replaceWith(text);
      continue;
    }
    // Filter attributes.
    for (const attr of Array.from(child.attributes)) {
      const safe = sanitizeAttr(tag, attr.name, attr.value);
      if (safe === null) {
        child.removeAttribute(attr.name);
      } else if (safe !== attr.value) {
        child.setAttribute(attr.name, safe);
      }
    }
    // Force-safe defaults for links.
    if (tag === "a" && child.getAttribute("target") === "_blank") {
      child.setAttribute("rel", "noopener noreferrer");
    }
    walk(child, doc);
  }
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // SSR fallback: strip all tags. The same content will be re-rendered
    // safely on the client after hydration.
    return input.replace(/<[^>]*>/g, "");
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${input}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return "";
  walk(root, doc);
  return root.innerHTML;
}
