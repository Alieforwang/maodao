import { applyPreference, extractFromMail, redactSample, senderDomain, type Candidate } from "./extract.js";
import { inferService } from "./service.js";
import type { SenderPref } from "./types.js";

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
  senderPrefs?: Record<string, SenderPref>;
}

export type Decision =
  | { action: "skip"; reason: string }
  | {
      action: "notify";
      reason: "code" | "maybe" | "link" | "all-mail";
      code: string | null;
      display: string | null;
      keyword: string | null;
      service: string;
      confidence: "high" | "medium" | "low" | "none";
      candidates: Candidate[];
      verifyUrl: string | null;
      domain: string;
      redacted: string;
    };

export function decideNotification(input: DecideInput): Decision {
  if (input.alreadyNotified) return { action: "skip", reason: "already-notified" };
  if (!input.internalDate) return { action: "skip", reason: "no-date" };
  if (input.internalDate - input.now > 10 * 60 * 1000) return { action: "skip", reason: "future" };
  if (input.now - input.internalDate > input.maxAgeMs) {
    return { action: "skip", reason: input.uid <= input.baselineUid ? "backlog" : "too-old" };
  }
  const domain = senderDomain(input.from);
  if (input.senderPrefs?.[domain]?.muted) return { action: "skip", reason: "muted" };
  const extracted = extractFromMail({ subject: input.subject, body: input.body });
  const ranked = [...extracted.candidates].sort((a, b) => b.score - a.score);
  const ordered = applyPreference(ranked, input.senderPrefs?.[domain]?.preferIndex);
  const chosen = ordered[0];
  const service = inferService(input.from, input.subject, input.body);
  const redacted = redactSample({
    subject: input.subject,
    from: input.from,
    body: input.body,
    codes: [...ranked.flatMap((item) => [item.code, item.display]), extracted.code || ""].filter(Boolean),
  });
  if ((extracted.kind === "code" || extracted.kind === "maybe") && chosen) {
    return {
      action: "notify",
      reason: extracted.kind === "maybe" ? "maybe" : "code",
      code: chosen.code,
      display: chosen.display,
      keyword: chosen.keyword,
      service,
      confidence: extracted.confidence,
      candidates: ranked,
      verifyUrl: null,
      domain,
      redacted,
    };
  }
  if (extracted.kind === "link" && extracted.verifyUrl) {
    return {
      action: "notify",
      reason: "link",
      code: null,
      display: null,
      keyword: "link",
      service,
      confidence: "low",
      candidates: [],
      verifyUrl: extracted.verifyUrl,
      domain,
      redacted,
    };
  }
  if (!input.notifyAllMail) return { action: "skip", reason: "no-code" };
  return {
    action: "notify",
    reason: "all-mail",
    code: null,
    display: null,
    keyword: null,
    service,
    confidence: "none",
    candidates: [],
    verifyUrl: null,
    domain,
    redacted,
  };
}
