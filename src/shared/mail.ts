import { simpleParser } from "mailparser";
import { htmlToText } from "./decode.js";
import type { AuthResult, MailHeaders } from "./types.js";

export interface ParsedMail {
  subject: string;
  from: string;
  text: string;
  html: string;
  messageId: string;
  date?: Date;
  headers: MailHeaders;
}

function authResult(results: string, key: "spf" | "dkim" | "dmarc"): AuthResult | undefined {
  const match = results.match(new RegExp(`${key}=(pass|fail|softfail|neutral|none)`, "i"));
  return match ? (match[1].toLowerCase() as AuthResult) : undefined;
}

function domainOf(address: string): string | undefined {
  const match = address.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return match ? match[1].toLowerCase() : undefined;
}

/** Snapshot the headers the spam scorer needs before they are thrown away at ingest. */
export function extractMailHeaders(headers: Map<string, unknown>): MailHeaders {
  const get = (name: string): string => {
    const value = headers.get(name) as { value?: unknown } | string | undefined;
    if (!value) return "";
    if (typeof value === "string") return value;
    return typeof value.value === "string" ? value.value : "";
  };
  const results = get("authentication-results");
  const snapshot: MailHeaders = {
    listUnsubscribe: headers.has("list-unsubscribe"),
  };
  if (results) {
    snapshot.spf = authResult(results, "spf");
    snapshot.dkim = authResult(results, "dkim");
    snapshot.dmarc = authResult(results, "dmarc");
  }
  const returnPath = get("return-path");
  if (returnPath) snapshot.returnPathDomain = domainOf(returnPath);
  return snapshot;
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
    headers: extractMailHeaders(parsed.headers as Map<string, unknown>),
  };
}
