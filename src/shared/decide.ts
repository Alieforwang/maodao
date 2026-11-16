import { mergeRuleAndAi, type AiVerdict } from "./aiRecognize.js";
import { extractFromMail, senderDomain, type Candidate } from "./extract.js";
import { inferService } from "./service.js";
import type { MailClass, MailSource, SenderPref } from "./types.js";

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
  senderPrefs?: Record<string, SenderPref>;
  /** Already checked against the original text. Null means the model was not used or failed. */
  ai?: AiVerdict | null;
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
      candidates: Candidate[];
      selectedIndex: number;
      verifyUrl: string | null;
      domain: string;
      expiresAt: number | null;
    };

export interface MailRecognition {
  classification: MailClass;
  confidence: "high" | "medium" | "low";
  source: MailSource;
  code: string | null;
  display: string | null;
  candidates: string[];
  displays: string[];
  domain: string;
  keyword: string | null;
  selectedIndex: number;
  /** receivedAt + the validity window the mail states, for code/maybe only. Null when unstated. */
  expiresAt: number | null;
}

export function describeRecognition(input: DecideInput): MailRecognition {
  const domain = senderDomain(input.from);
  const extracted = mergeRuleAndAi(extractFromMail({ subject: input.subject, body: input.body, html: input.html, from: input.from }), input.ai ?? null);
  const ranked = extracted.candidates.slice(0, 3);
  const selectedIndex = preferredIndex(ranked, input.senderPrefs?.[domain]?.preferIndex);
  const chosen = ranked[selectedIndex] || ranked[0];
  let classification: MailClass = "none";
  if (extracted.confidence === "high" && chosen?.code) classification = "code";
  else if (extracted.confidence === "medium" && ranked.length > 0) classification = "maybe";
  else if (extracted.kind === "link" && extracted.verifyUrl) classification = "link";
  const expiresAt = (classification === "code" || classification === "maybe") && extracted.validMinutes
    ? input.internalDate + extracted.validMinutes * 60_000
    : null;
  return {
    classification,
    confidence: extracted.confidence,
    source: extracted.keyword === "ai" ? "ai" : "rule",
    code: classification === "none" || classification === "link" ? null : chosen?.code || null,
    display: classification === "none" || classification === "link" ? null : chosen?.display || chosen?.code || null,
    candidates: ranked.map((item) => item.code),
    displays: ranked.map((item) => item.display),
    domain,
    keyword: extracted.keyword,
    selectedIndex: classification === "maybe" || classification === "code" ? selectedIndex : 0,
    expiresAt,
  };
}

export function decideNotification(input: DecideInput): Decision {
  if (input.alreadyNotified) return { action: "skip", reason: "already-notified" };
  if (!input.internalDate) return { action: "skip", reason: "no-date" };
  if (input.internalDate - input.now > 10 * 60 * 1000) return { action: "skip", reason: "future" };
  if (input.now - input.internalDate > input.maxAgeMs) {
    return { action: "skip", reason: input.uid <= input.baselineUid ? "backlog" : "too-old" };
  }
  const domain = senderDomain(input.from);
  if (input.senderPrefs?.[domain]?.muted) return { action: "skip", reason: "muted" };
  const found = describeRecognition(input);
  const service = inferService(input.from, input.subject, input.body);
  const ranked = found.candidates.map((code, index) => ({ code, display: found.displays[index] || code, keyword: found.keyword || "", score: 80 - index, source: "body" as const }));
  if (found.classification === "code" && found.code) {
    return { action: "notify", reason: "code", code: found.code, display: found.display, keyword: found.keyword, service, candidates: ranked, selectedIndex: found.selectedIndex, verifyUrl: null, domain, expiresAt: found.expiresAt };
  }
  if (found.classification === "maybe" && found.code) {
    return { action: "notify", reason: "maybe", code: found.code, display: found.display, keyword: found.keyword, service, candidates: ranked, selectedIndex: found.selectedIndex, verifyUrl: null, domain, expiresAt: found.expiresAt };
  }
  if (found.classification === "link") {
    const extracted = extractFromMail({ subject: input.subject, body: input.body, html: input.html, from: input.from });
    return { action: "notify", reason: "link", code: null, display: null, keyword: "link", service, candidates: [], selectedIndex: 0, verifyUrl: extracted.verifyUrl, domain, expiresAt: null };
  }
  if (!input.notifyAllMail) return { action: "skip", reason: "no-code" };
  return { action: "notify", reason: "all-mail", code: null, display: null, keyword: null, service, candidates: [], selectedIndex: 0, verifyUrl: null, domain, expiresAt: null };
}

function preferredIndex(candidates: Candidate[], preferIndex?: number): number {
  if (preferIndex === undefined || preferIndex < 0 || preferIndex >= candidates.length) return 0;
  const picked = candidates[preferIndex];
  const best = candidates[0];
  if (!picked || !best || best.score - picked.score > 25) return 0;
  return preferIndex;
}
