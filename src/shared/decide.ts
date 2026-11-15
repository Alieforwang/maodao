import { extractFromMail } from "./extract.js";
import { inferService } from "./service.js";

export interface DecideInput {
  subject: string;
  from: string;
  body: string;
  internalDate: number;
  now: number;
  uid: number;
  baselineUid: number;
  maxAgeMs: number;
  notifyAllMail: boolean;
  alreadyNotified: boolean;
  html?: string;
}

export type Decision =
  | { action: "skip"; reason: string }
  | { action: "notify"; reason: "code" | "all-mail"; code: string | null; keyword: string | null; service: string };

export function decideNotification(input: DecideInput): Decision {
  if (input.alreadyNotified) return { action: "skip", reason: "already-notified" };
  if (!input.internalDate) return { action: "skip", reason: "no-date" };
  if (input.internalDate - input.now > 10 * 60 * 1000) return { action: "skip", reason: "future" };
  if (input.now - input.internalDate > input.maxAgeMs) {
    return { action: "skip", reason: input.uid <= input.baselineUid ? "backlog" : "too-old" };
  }
  const extracted = extractFromMail({ subject: input.subject, body: input.body, html: input.html, from: input.from });
  const service = inferService(input.from, input.subject, input.body);
  if (extracted.code && extracted.confidence !== "low") {
    return { action: "notify", reason: "code", code: extracted.code, keyword: extracted.keyword, service };
  }
  if (!input.notifyAllMail) return { action: "skip", reason: "no-code" };
  return { action: "notify", reason: "all-mail", code: null, keyword: null, service };
}
