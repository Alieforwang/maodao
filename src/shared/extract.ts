import { htmlToText } from "./decode.js";

export type Confidence = "high" | "medium" | "low";

export interface CodeHit {
  code: string;
  keyword: string;
  display?: string;
  confidence?: Confidence;
}

export interface Candidate {
  code: string;
  display: string;
  keyword: string;
  score: number;
  source: "subject" | "body";
}

export interface MailExtract {
  code: string | null;
  display: string | null;
  keyword: string | null;
  confidence: Confidence;
  candidates: Candidate[];
  kind: "code" | "maybe" | "link" | "none";
  verifyUrl: string | null;
}

interface Label {
  kind: "strong" | "conditional" | "negative";
  phrase: string;
  start: number;
  end: number;
}

interface RawCode {
  code: string;
  display: string;
  start: number;
  end: number;
}

const STRONG = [
  "验证码", "校验码", "动态密码", "动态码", "一次性密码", "确认码", "认证码", "安全码", "登录码",
  "驗證碼", "校驗碼", "動態密碼", "動態碼", "一次性密碼", "確認碼", "認證碼", "安全碼", "登入碼",
  "認証コード", "確認コード", "認証番号", "ワンタイムパスワード", "確認番号",
  "인증번호", "인증 번호", "인증코드", "확인코드",
  "código de verificación", "codigo de verificacion", "código de seguridad", "codigo de seguridad",
  "bestätigungscode", "sicherheitscode", "verifizierungscode",
  "code de vérification", "code de verification", "code de validation", "code de confirmation",
  "код подтверждения", "проверочный код", "одноразовый код", "код безопасности",
  "código de verificação", "codigo de verificacao", "código de segurança",
  "verification code", "security code", "authentication code", "one-time password", "one time password",
  "one-time code", "one time code", "login code", "sign-in code", "signin code", "steam guard",
  "passcode", "otp", "enter this code", "enter the code", "enter code",
  "ihr code", "votre code", "tu código", "su código", "seu código", "ваш код",
];

const CONDITIONAL = ["your code", "use code", "use this code", "the code", "code is", "code:", "code：", "code"];

const NEGATIVE = [
  "promo code", "promotional code", "coupon code", "coupon", "invite code", "invitation code",
  "referral code", "reference number", "reference code", "reference", "ticket number", "ticket id",
  "case number", "case id", "order number", "order id", "order #", "tracking number", "tracking id",
  "tracking", "invoice", "version", "zip code", "area code", "error code", "status code",
  "postal code", "country code", "bar code", "barcode", "source code", "discount code", "gift code",
  "voucher", "sku", "优惠码", "优惠券", "邀请码", "推荐码", "兑换码", "激活码", "不是验证码", "无需验证码", "不需要验证码", "工单号", "工单",
  "尾号", "版本", "订单号", "订单", "单号", "运单", "快递单号", "快递", "参考号", "参考编号", "參考編號",
  "票号", "票號", "序列号", "手机号", "手机", "电话", "客服", "金额",
];

const LINK_PHRASE = /verify your email|confirm your email|confirm your address|click (?:here|the link|this link) to (?:verify|confirm)|点击链接|點擊連結|点击下方|點此驗證|验证您的邮箱|验证邮箱|邮箱验证链接|メールアドレスを確認|メールを確認|이메일 인증|verifique su correo|bestätigen sie ihre e-mail|confirmez votre (?:adresse )?e-?mail|подтвердите (?:ваш )?адрес|confirme seu e-?mail/i;

const STOP = new Set(["your", "code", "this", "with", "from", "that", "have", "will", "mail", "link", "click", "here", "date", "time", "free", "shop", "sale", "only", "just", "more", "when", "order", "total", "price", "email", "login", "apple", "steam", "guard", "below", "ready", "valid", "until", "after", "please", "thanks", "hello", "enter", "using", "https", "http", "info", "help", "item", "name", "user", "pass", "word", "team", "dear", "null", "true", "false", "width", "style", "color", "class", "span", "font", "size", "pixel", "title", "table", "align", "none", "block", "auto", "need", "continue", "signing", "account", "google", "minutes", "expire", "expires", "someone", "share", "anyone", "login", "dont", "soon", "keep", "safe", "open", "view", "button"]);

export function normalizeMailText(input: string): string {
  return prepare(input).text;
}

export function extractVerificationCode(input: string): CodeHit | null {
  const result = extractFromMail({ subject: "", body: input });
  if (!result.code || result.confidence === "low") return null;
  return { code: result.code, keyword: result.keyword || "", display: result.display || result.code, confidence: result.confidence };
}

export function extractFromMail(input: { subject?: string; body?: string }): MailExtract {
  const subject = prepare(input.subject || "");
  const body = prepare(input.body || "");
  const subjectHasStrong = hasStrong(subject.text);
  const subjectCodes = scorePart(subject.text, subject.emphasis, "subject", false);
  const bodyCodes = scorePart(body.text, body.emphasis, "body", subjectHasStrong);
  const merged = dedupe([...subjectCodes, ...bodyCodes]).sort((a, b) => b.score - a.score);
  const visible = merged.filter((item) => item.score >= 48);
  const best = visible[0];
  const second = visible[1];
  let confidence: Confidence = "low";
  if (best && best.score >= 64 && (!second || best.score - second.score >= 10)) confidence = "high";
  else if (best) confidence = "medium";
  const links = unique([...subject.links, ...body.links]).filter(isActionableLink);
  const linkText = `${subject.text}\n${body.text}`;
  const verifyUrl = LINK_PHRASE.test(linkText) ? links[0] || null : null;
  if (best && confidence !== "low") {
    const top = visible.slice(0, 3);
    return {
      code: best.code,
      display: best.display,
      keyword: best.keyword,
      confidence,
      candidates: top,
      kind: confidence === "high" ? "code" : "maybe",
      verifyUrl: confidence === "high" ? null : verifyUrl,
    };
  }
  if (verifyUrl) {
    return { code: null, display: null, keyword: "link", confidence: "low", candidates: [], kind: "link", verifyUrl };
  }
  return { code: null, display: null, keyword: null, confidence: "low", candidates: [], kind: "none", verifyUrl: null };
}

export function senderDomain(from: string): string {
  const match = from.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return (match?.[1] || "").toLowerCase();
}

export function redactSample(input: { subject: string; from: string; body: string; codes: string[] }): string {
  let text = `From: sender@${senderDomain(input.from) || "example.com"}\nSubject: ${input.subject}\n\n${input.body}`;
  const tokens = [...input.codes].sort((a, b) => b.length - a.length);
  for (const code of tokens) {
    if (code) text = text.split(code).join("‹code›");
  }
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "name@example.com");
  text = text.replace(/1[3-9]\d{9}/g, "1**********");
  text = text.replace(/https?:\/\/\S+/gi, "https://example.com/verify");
  return text.slice(0, 1800);
}

export function applyPreference<T extends { score: number }>(candidates: T[], preferIndex?: number): T[] {
  if (preferIndex === undefined || preferIndex < 0 || preferIndex >= candidates.length) return candidates;
  const picked = candidates[preferIndex];
  const best = candidates[0];
  if (!picked || !best || picked.score < 48 || best.score - picked.score > 25) return candidates;
  return [picked, ...candidates.filter((_, index) => index !== preferIndex)];
}

function prepare(input: string): { text: string; links: string[]; emphasis: Set<string> } {
  const links = collectLinks(input);
  const emphasis = collectEmphasis(input);
  let text = input.replace(/[\u200b-\u200d\ufeff]/g, "");
  if (/<[a-z!][^>]*>/i.test(text)) text = htmlToText(text);
  text = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
  text = text.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/(?:\d[ \u00a0]){3,7}\d/g, (group) => group.replace(/[ \u00a0]/g, ""));
  return { text, links, emphasis };
}

function scorePart(text: string, emphasis: Set<string>, source: "subject" | "body", subjectStrong: boolean): Candidate[] {
  const codes = findCodes(text);
  const labels = findLabels(text);
  const lines = new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const found: Candidate[] = [];
  for (const raw of codes) {
    if (STOP.has(raw.code.toLowerCase())) continue;
    if (!/\d/.test(raw.code) && (raw.code.match(/[A-Z]/g) || []).length < 2) continue;
    if (!/\d/.test(raw.code) && !labels.some((label) => label.kind === "strong" && label.end <= raw.start && raw.start - label.end <= 8)) continue;
    if (isYear(raw, text) || isPrice(raw, text) || insidePhone(raw, text)) continue;
    const label = labelFor(raw, labels, codes, text);
    const ownLine = lines.has(raw.display) || lines.has(raw.code);
    const emphasized = emphasis.has(raw.code.toLowerCase()) || emphasis.has(raw.display.toLowerCase());
    let score = 0;
    let keyword = label?.phrase || "";
    if (!label) {
      if (ownLine) score += 26;
      if (emphasized) score += 28;
      if (subjectStrong && source === "body" && (ownLine || emphasized)) score += 36;
    } else if (label.kind === "negative") {
      score -= 90;
      keyword = label.phrase;
    } else if (label.kind === "strong") {
      score += 62;
      if (gap(label, raw) <= 8) score += 16;
      else if (gap(label, raw) <= 24) score += 8;
      if (!/\d/.test(raw.code)) score -= 4;
    } else {
      const digits = raw.code.replace(/\D/g, "").length;
      score += digits >= 4 ? 46 : 8;
      if (gap(label, raw) <= 6) score += 10;
      if (!/\d/.test(raw.code)) score -= 40;
    }
    if (raw.code.length === 6) score += 14;
    else if (raw.code.length === 5 || raw.code.length === 4) score += 4;
    if (ownLine && label?.kind !== "negative") score += 18;
    if (emphasized && label?.kind !== "negative") score += 16;
    if (label?.kind !== "negative" && /to verify|to sign in|to log in|完成验证|用于登录|请输入|输入此/i.test(text.slice(raw.end, raw.end + 24))) score += 12;
    if (subjectStrong && source === "body" && label?.kind !== "negative" && score >= 40) score += 8;
    if (score < 48) continue;
    found.push({ code: raw.code, display: raw.display, keyword, score, source });
  }
  return found;
}

function findCodes(text: string): RawCode[] {
  const taken: Array<[number, number]> = [];
  const found: RawCode[] = [];
  const push = (display: string, code: string, start: number, end: number) => {
    if (taken.some(([from, to]) => start < to && end > from)) return;
    if (!/^[A-Za-z0-9]{4,8}$/.test(code)) return;
    taken.push([start, end]);
    found.push({ display, code, start, end });
  };
  const grouped = /(?<![A-Za-z0-9])(\d{3})([- ])(\d{3})(?![A-Za-z0-9])|(?<![A-Za-z0-9])(\d{2})([-])(\d{2})([-])(\d{2})(?![A-Za-z0-9])|(?<![A-Za-z0-9])([A-Za-z]{3,5})( )(\d{3})(?![A-Za-z0-9])/g;
  for (const match of text.matchAll(grouped)) {
    const display = match[0];
    push(display, display.replace(/[- ]/g, ""), match.index || 0, (match.index || 0) + display.length);
  }
  const google = /(?<![A-Za-z0-9])G-(\d{6})(?![A-Za-z0-9])/g;
  for (const match of text.matchAll(google)) {
    const start = (match.index || 0) + 2;
    push(match[1], match[1], start, start + match[1].length);
  }
  const plain = /(?<![A-Za-z0-9])([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g;
  for (const match of text.matchAll(plain)) {
    push(match[1], match[1], match.index || 0, (match.index || 0) + match[1].length);
  }
  return found;
}

function findLabels(text: string): Label[] {
  const phrases = [
    ...NEGATIVE.map((phrase) => ({ phrase, kind: "negative" as const })),
    ...STRONG.map((phrase) => ({ phrase, kind: "strong" as const })),
    ...CONDITIONAL.map((phrase) => ({ phrase, kind: "conditional" as const })),
  ].sort((a, b) => b.phrase.length - a.phrase.length);
  const lower = text.toLowerCase();
  const used: Array<[number, number]> = [];
  const labels: Label[] = [];
  for (const item of phrases) {
    const needle = item.phrase.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      from = end;
      if (/[a-z]/i.test(needle[0]) && at > 0 && /[a-z]/i.test(lower[at - 1])) continue;
      if (/[a-z]/i.test(needle[needle.length - 1]) && /[a-z]/i.test(lower[end] || "")) continue;
      if (used.some(([start, stop]) => at < stop && end > start)) continue;
      used.push([at, end]);
      labels.push({ kind: item.kind, phrase: item.phrase, start: at, end });
    }
  }
  return labels;
}

function labelFor(code: RawCode, labels: Label[], codes: RawCode[], text: string): Label | undefined {
  let best: { label: Label; distance: number } | undefined;
  let strong: { label: Label; distance: number } | undefined;
  for (const label of labels) {
    if (label.start < code.end && label.end > code.start) continue;
    if (label.kind === "negative" && label.start >= code.end) continue;
    const distance = label.end <= code.start ? code.start - label.end : label.start - code.end;
    if (distance > 48) continue;
    if (label.phrase.toLowerCase() === "code" && distance > 8) continue;
    if (anotherCodeBetween(label, code, codes, text)) continue;
    if (!best || distance < best.distance) best = { label, distance };
    if (label.kind === "strong" && (!strong || distance < strong.distance)) strong = { label, distance };
  }
  if (!best) return undefined;
  if (best.label.kind === "negative") return best.label;
  if (strong && strong.distance <= 48) return strong.label;
  return best.label;
}

function anotherCodeBetween(label: Label, code: RawCode, codes: RawCode[], text: string): boolean {
  const left = Math.min(label.end, code.end);
  const right = Math.max(label.start, code.start);
  return codes.some((other) => other.start !== code.start && other.start >= left && other.start < right && /\d/.test(other.code) && !STOP.has(other.code.toLowerCase()) && !isYear(other, text));
}

function gap(label: Label, code: RawCode): number {
  return label.end <= code.start ? code.start - label.end : label.start - code.end;
}

function isYear(code: RawCode, text: string): boolean {
  if (!/^(19|20)\d{2}$/.test(code.code)) return false;
  const around = text.slice(Math.max(0, code.start - 2), code.end + 2);
  return /[年/\-.]|月|year/i.test(around);
}

function isPrice(code: RawCode, text: string): boolean {
  const before = text.slice(Math.max(0, code.start - 2), code.start);
  const after = text.slice(code.end, code.end + 6);
  if (/[¥￥$]$/.test(before)) return true;
  if (/^\s*(?:元|美元|USD|CNY)/i.test(after)) return true;
  if (/^\.\d/.test(after)) return true;
  return false;
}

function insidePhone(code: RawCode, text: string): boolean {
  const aroundStart = Math.max(0, code.start - 16);
  const around = text.slice(aroundStart, code.end + 16);
  const phone = around.match(/1[3-9]\d{9}|400-?\d{3}-?\d{4}/);
  if (!phone || phone.index === undefined) return false;
  const phoneAt = aroundStart + phone.index;
  return code.start >= phoneAt && code.start < phoneAt + phone[0].length;
}

function hasStrong(text: string): boolean {
  const lower = text.toLowerCase();
  return STRONG.some((phrase) => lower.includes(phrase.toLowerCase()));
}

function collectLinks(input: string): string[] {
  const links: string[] = [];
  for (const match of input.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) links.push(match[1]);
  for (const match of input.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) links.push(match[0]);
  return links;
}

function collectEmphasis(input: string): Set<string> {
  const set = new Set<string>();
  if (!/<[a-z]/i.test(input)) return set;
  const chunks = [
    ...input.matchAll(/<(b|strong|h1|h2)\b[^>]*>([\s\S]*?)<\/\1>/gi),
    ...input.matchAll(/<[^>]+style\s*=\s*["'][^"']*font-size\s*:\s*(?:2[0-9]|[3-9]\d)px[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/gi),
  ];
  for (const match of chunks) {
    const inner = htmlToText(match[2] || match[1] || "").trim();
    const token = inner.replace(/[- ]/g, "");
    if (token) set.add(token.toLowerCase());
    if (inner) set.add(inner.toLowerCase());
  }
  return set;
}

function isActionableLink(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  if (/\.(png|jpe?g|gif|svg|css|js)(\?|$)/i.test(url)) return false;
  if (/unsubscribe|privacy|mailto:|fonts\.|doubleclick|pixel/i.test(url)) return false;
  return true;
}

function dedupe(items: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const item of items) {
    const key = item.code.toLowerCase();
    const prev = map.get(key);
    if (!prev || item.score > prev.score) map.set(key, item);
  }
  return [...map.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
