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
  for (const form of recipientForms(recipient)) {
    text = text.split(form).join("recipient@example.com");
  }
  text = text.replace(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi, (url) => {
    const withScheme = /^www\./i.test(url) ? `https://${url}` : url;
    try {
      return new URL(withScheme).origin;
    } catch {
      return "https://link.example";
    }
  });
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "token");
  text = text.replace(/\bauthorization\s*:\s*bearer\s+\S+/gi, "token");
  text = text.replace(/\b(?:access_token|refresh_token|id_token|bearer|authorization)\b[\s:=]+[\w.~+/-]+/gi, "token");
  text = text.replace(/\btoken\s*[:=]\s*\S+/gi, "token");
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "token");
  text = text.replace(/[A-Z0-9._%+-]+(?:@|%(?:25)*40)[A-Z0-9.-]+(?:\.|%2E)[A-Z]{2,}/gi, "name@example.com");
  text = redactBase64Emails(text);
  text = text.replace(/(?:\+|00)\d{1,3}[\s().-]*\d(?:[\s().-]*\d){6,14}/g, "[phone]");
  text = text.replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[phone]");
  text = text.replace(/(?<!\d)\(\d{3}\)[\s.-]*\d{3}[\s.-]*\d{4}(?!\d)/g, "[phone]");
  return text;
}

function recipientForms(recipient?: string): string[] {
  const value = recipient?.trim();
  if (!value) return [];
  const forms = new Set<string>();
  for (const seed of [value, value.toLowerCase()]) {
    forms.add(seed);
    const once = encodeURIComponent(seed);
    forms.add(once);
    forms.add(encodeURIComponent(once));
    const encoded = encodeBase64(seed);
    if (encoded.length >= 16) {
      forms.add(encoded);
      forms.add(encoded.replace(/=+$/, ""));
      forms.add(encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    }
  }
  return [...forms].filter(Boolean).sort((a, b) => b.length - a.length);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function redactBase64Emails(value: string): string {
  return value.replace(/\b[A-Za-z0-9+/_-]{16,}={0,2}\b/g, (token) => {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    let decoded = "";
    try {
      decoded = atob(padded);
    } catch {
      return token;
    }
    if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(decoded.trim())) return "name@example.com";
    return token;
  });
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
