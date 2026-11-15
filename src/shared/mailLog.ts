import type { MailClass, MailSource, MailSummary, SenderPref, StoredMail } from "./types.js";

export function sanitizeMailText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, 12_000);
}

export function pruneMails<T extends { accountId: string; receivedAt: number }>(mails: T[], options: { now: number; days: number; perAccount: number }): T[] {
  const cutoff = options.now - options.days * 24 * 60 * 60 * 1000;
  const fresh = mails.filter((mail) => mail.receivedAt >= cutoff);
  const grouped = new Map<string, T[]>();
  for (const mail of fresh) {
    const list = grouped.get(mail.accountId) || [];
    list.push(mail);
    grouped.set(mail.accountId, list);
  }
  const kept: T[] = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => b.receivedAt - a.receivedAt);
    kept.push(...list.slice(0, options.perAccount));
  }
  kept.sort((a, b) => b.receivedAt - a.receivedAt);
  return kept;
}

export function filterMails(mails: MailSummary[], query: { accountId?: string; classification?: MailClass | "all"; search?: string }): MailSummary[] {
  const needle = (query.search || "").trim().toLowerCase();
  return mails.filter((mail) => {
    if (query.accountId && query.accountId !== "all" && mail.accountId !== query.accountId) return false;
    if (query.classification && query.classification !== "all" && mail.classification !== query.classification) return false;
    if (!needle) return true;
    return `${mail.from}\n${mail.subject}`.toLowerCase().includes(needle);
  });
}

export function correctionPreference(input: {
  action: "code" | "link" | "none";
  code?: string;
  candidates: string[];
  existing?: SenderPref;
}): SenderPref {
  const existing = input.existing || {};
  if (input.action === "none") return { ...existing, muted: true };
  const index = input.action === "code" && input.code
    ? input.candidates.findIndex((item) => item.toLowerCase() === input.code?.toLowerCase())
    : -1;
  return {
    ...existing,
    muted: false,
    ...(index >= 0 ? { preferIndex: index } : {}),
  };
}

export function applyCorrection(mail: StoredMail, action: { kind: "code" | "link" | "none"; code?: string }): StoredMail {
  if (action.kind === "none") {
    return { ...mail, classification: "none", source: "user", code: null, display: null, confidence: "high" };
  }
  if (action.kind === "link") {
    return { ...mail, classification: "link", source: "user", code: null, display: null, confidence: "high" };
  }
  const code = (action.code || mail.code || "").trim();
  return { ...mail, classification: "code", source: "user", code: code || null, display: code || null, confidence: "high" };
}

export function highlightCandidates(text: string, needles: string[]): Array<{ text: string; hit: boolean }> {
  const marks = [...new Set(needles.map((item) => item.trim()).filter((item) => item.length >= 4))].sort((a, b) => b.length - a.length);
  if (!marks.length || !text) return [{ text, hit: false }];
  const ranges: Array<[number, number]> = [];
  const lower = text.toLowerCase();
  for (const mark of marks) {
    const token = mark.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(token, from);
      if (at < 0) break;
      ranges.push([at, at + mark.length]);
      from = at + mark.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] >= last[1]) merged.push(range);
  }
  if (!merged.length) return [{ text, hit: false }];
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}

export function classLabel(value: MailClass): string {
  if (value === "code") return "验证码";
  if (value === "link") return "链接验证";
  if (value === "maybe") return "可能是验证码";
  return "非验证码";
}

export function sourceLabel(value: MailSource): string {
  if (value === "ai") return "AI";
  if (value === "user") return "手动";
  return "规则";
}
