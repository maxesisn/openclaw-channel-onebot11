import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function splitTextByLength(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let s = text;
  while (s.length > 0) {
    out.push(s.slice(0, limit));
    s = s.slice(limit);
  }
  return out;
}

export async function resolveToBase64Url(url: string): Promise<string> {
  // Convert local file:// URLs to base64://
  if (url.startsWith("file:")) {
    const p = fileURLToPath(url);
    const buf = await fs.readFile(p);
    return `base64://${buf.toString("base64")}`;
  }
  return url;
}

export function isHttpUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

export function clampText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + "…";
}
