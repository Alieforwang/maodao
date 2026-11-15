import { senderDomain } from "./extract.js";

export interface RedactedFixture {
  id: string;
  lang: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  expected: string | null;
  kind: "code" | "link" | "none";
  note: string;
}

export function toRedactedFixture(input: {
  from: string;
  subject: string;
  text: string;
  html?: string;
  expected: string | null;
  kind: "code" | "link" | "none";
  recipient?: string;
}): RedactedFixture {
  const domain = senderDomain(input.from) || "example.com";
  const text = redactSensitive(input.text, input.recipient);
  const html = input.html ? redactSensitive(input.html, input.recipient) : undefined;
  return {
    id: `manual-${domain.replace(/[^a-z0-9]+/gi, "-")}`,
    lang: guessLang(`${input.subject}\n${text}`),
    from: `notify@${domain}`,
    subject: redactSensitive(input.subject, input.recipient),
    text,
    html,
    expected: input.expected,
    kind: input.kind,
    note: "手动导出",
  };
}

export function redactSensitive(value: string, recipient?: string): string {
  let text = value;
  if (recipient) {
    const escaped = recipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), "recipient@example.com");
  }
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "token");
  text = text.replace(/\b(?:access_token|refresh_token|bearer)\b[\s:=]+[\w.-]+/gi, "token");
  text = text.replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "1**********");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "name@example.com");
  return text;
}

function guessLang(text: string): string {
  if (/驗證碼|確認碼/.test(text)) return "zh-Hant";
  if (/验证码|校验码/.test(text)) return "zh-Hans";
  if (/認証コード|確認コード/.test(text)) return "ja";
  if (/인증번호|인증 코드/.test(text)) return "ko";
  if (/código/i.test(text)) return "es";
  if (/bestätigungscode/i.test(text)) return "de";
  if (/code de vérification/i.test(text)) return "fr";
  if (/код подтверждения/.test(text)) return "ru";
  return "en";
}
