import { simpleParser } from "mailparser";
import { htmlToText } from "./decode.js";

export interface ParsedMail {
  subject: string;
  from: string;
  text: string;
  html: string;
  messageId: string;
  date?: Date;
}

/** Drop a plain-text part that repeats the HTML, and keep the HTML for emphasis. */
export function mergeMailBodies(text: string, html: string): { text: string; html: string } {
  const rendered = html ? htmlToText(html).replace(/\u00a0/g, " ").trim() : "";
  const plain = text.replace(/\u00a0/g, " ").trim();
  if (!plain) return { text: rendered, html };
  if (!rendered) return { text: plain, html };
  const left = plain.replace(/\s+/g, " ");
  const right = rendered.replace(/\s+/g, " ");
  if (left === right || left.includes(right) || right.includes(left)) {
    return { text: right.length >= left.length ? rendered : plain, html };
  }
  return { text: `${plain}\n${rendered}`, html };
}

export async function parseRawMail(source: Buffer | string): Promise<ParsedMail> {
  const parsed = await simpleParser(source);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const merged = mergeMailBodies(parsed.text || "", html);
  return {
    subject: parsed.subject || "",
    from: parsed.from?.text || "",
    text: merged.text,
    html: merged.html,
    messageId: parsed.messageId || "",
    date: parsed.date || undefined,
  };
}
