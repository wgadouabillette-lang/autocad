import DOMPurify from "dompurify";

/** Config type compatible with DOMPurify without relying on namespace export. */
type PurifyConfig = {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
  FORBID_TAGS?: string[];
  FORBID_ATTR?: string[];
};

/** Allowlist for note / handoff HTML rendered in the UI. */
const NOTE_HTML_CONFIG: PurifyConfig = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "div",
    "span",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "pre",
    "code",
    "a",
    "mark",
  ],
  ALLOWED_ATTR: ["href", "title", "class", "target", "rel"],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "link", "meta", "style"],
  FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onfocus", "onblur"],
};

function hardenLinks(dirty: string): string {
  // Force safe link targets after purify.
  return dirty.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    let next = attrs;
    if (!/\brel=/i.test(next)) {
      next += ' rel="noopener noreferrer"';
    }
    if (!/\btarget=/i.test(next)) {
      next += ' target="_blank"';
    }
    // Drop javascript: / data: hrefs if any slipped through.
    next = next.replace(
      /\bhref\s*=\s*(['"])\s*(javascript:|data:|vbscript:)[^'"]*\1/gi,
      'href="#"',
    );
    return `<a${next}>`;
  });
}

/** Sanitize untrusted HTML before dangerouslySetInnerHTML / editor injection. */
export function sanitizeNoteHtml(html: string): string {
  const raw = typeof html === "string" ? html : "";
  if (!raw.trim()) return "";
  const cleaned = DOMPurify.sanitize(raw, NOTE_HTML_CONFIG);
  return hardenLinks(cleaned);
}
