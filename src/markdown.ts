// Light markdown downgrade (keep content, remove most formatting markers)
export function markdownToPlainTextLight(input: string): string {
  let t = input;

  // Links: [text](url) -> text (url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Bold/italic/strikethrough
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");

  // Inline code
  t = t.replace(/`([^`]+)`/g, "$1");

  // Headings: strip leading #'s
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Blockquotes: keep content
  t = t.replace(/^\s*>\s?/gm, "");

  // Tables: keep pipes but collapse multiple spaces
  // (do nothing heavy here; keep it readable)

  return t;
}
