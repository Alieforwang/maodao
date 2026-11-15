import { mergeRuleAndAi, type AiVerdict } from "./aiRecognize.js";
import { extractFromMail, senderDomain, type Candidate } from "./extract.js";
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
  const extracted = mergeRuleAndAi(extractFromMail({ subject: input.subject, body: input.body, html: input.html, from: input.from }), input.ai ?? null);
  const service = inferService(input.from, input.subject, input.body);
  const ranked = extracted.candidates.slice(0, 3);
  const selectedIndex = preferredIndex(ranked, input.senderPrefs?.[domain]?.preferIndex);
  const chosen = ranked[selectedIndex] || ranked[0];
  if (extracted.confidence === "high" && chosen) {
    return { action: "notify", reason: "code", code: chosen.code, display: chosen.display, keyword: chosen.keyword, service, candidates: ranked, selectedIndex, verifyUrl: null, domain };
  }
  if (extracted.confidence === "medium" && ranked.length > 0) {
    return { action: "notify", reason: "maybe", code: chosen.code, display: chosen.display, keyword: chosen.keyword, service, candidates: ranked, selectedIndex, verifyUrl: null, domain };
  }
  if (extracted.kind === "link" && extracted.verifyUrl) {
    return { action: "notify", reason: "link", code: null, display: null, keyword: "link", service, candidates: [], selectedIndex: 0, verifyUrl: extracted.verifyUrl, domain };
  }
  if (!input.notifyAllMail) return { action: "skip", reason: "no-code" };
  return { action: "notify", reason: "all-mail", code: null, display: null, keyword: null, service, candidates: [], selectedIndex: 0, verifyUrl: null, domain };
}

function preferredIndex(candidates: Candidate[], preferIndex?: number): number {
  if (preferIndex === undefined || preferIndex < 0 || preferIndex >= candidates.length) return 0;
  const picked = candidates[preferIndex];
  const best = candidates[0];
  if (!picked || !best || best.score - picked.score > 25) return 0;
  return preferIndex;
}
