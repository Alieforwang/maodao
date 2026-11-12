import { htmlToText } from "./decode.js";

export interface CodeHit {
  code: string;
  keyword: string;
}

interface Pattern {
  keyword: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    keyword: "验证码",
    re: /(?:验证码|校验码|动态密码|动态码|一次性密码|确认码|认证码|安全码|登录码)\s*(?:是|为|就是)?\s*[：:]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g,
  },
  {
    keyword: "验证码",
    re: /(?<![A-Za-z0-9])([0-9]{4,8})\s*(?:是|为)\s*(?:你|您)的?\s*(?:验证码|校验码|动态码|动态密码)/g,
  },
  { keyword: "google", re: /\bG-(\d{6})\b/g },
  {
    keyword: "verification code",
    re: /(?:verification|security|authentication|login|sign-in|signin)\s+code(?:\s+[a-z]+){0,8}\s+is\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/gi,
  },
  {
    keyword: "verification code",
    re: /(?:verification|security|authentication|login|sign-in|signin)\s+code\s*(?:is|:)?\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/gi,
  },
  {
    keyword: "otp",
    re: /\b(?:otp|one[- ]time password|one[- ]time code|passcode)\b\s*(?:is|:)?\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/gi,
  },
  {
    keyword: "code",
    re: /\byour\s+code\s+is\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/gi,
  },
  {
    keyword: "steam",
    re: /steam\s+guard(?:\s+code)?(?:\s+[a-z]+){0,8}\s*(?:is|:)?\s*[:：]?\s*([A-Za-z0-9]{5})(?![A-Za-z0-9])/gi,
  },
  {
    keyword: "code",
    re: /(?<![A-Za-z0-9])([A-Za-z0-9]{4,8})\s+is\s+your\s+(?:[a-z0-9.+-]+\s+){0,6}(?:verification|security|authentication|login|sign-in|one-time)?\s*code\b/gi,
  },
  {
    keyword: "code",
    re: /(?<!error\s)(?<!zip\s)(?<!area\s)(?<!status\s)(?<!postal\s)(?<!country\s)(?<!bar\s)\bcode\s*(?:is|:)\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/gi,
  },
];

const KEYWORDS = [
  "verification code",
  "security code",
  "authentication code",
  "one-time password",
  "one time password",
  "one-time code",
  "login code",
  "sign-in code",
  "steam guard",
  "一次性密码",
  "动态密码",
  "验证码",
  "校验码",
  "动态码",
  "确认码",
  "认证码",
  "安全码",
  "登录码",
  "passcode",
  "otp",
];

export function normalizeMailText(input: string): string {
  let text = input.replace(/[\u200b-\u200d\ufeff]/g, "");
  text = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
  text = text.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  text = text.replace(/(?:\d[ \u00a0]){3,7}\d/g, (group) => group.replace(/[ \u00a0]/g, ""));
  text = text.replace(/https?:\/\/\S+/gi, " ");
  if (/<[a-z!][^>]*>/i.test(text)) text = htmlToText(text);
  return text;
}

function plausible(code: string, text: string, at: number): boolean {
  if (!/^[A-Za-z0-9]{4,8}$/.test(code) || !/\d/.test(code)) return false;
  const before = text.slice(Math.max(0, at - 8), at);
  const after = text.slice(at + code.length, at + code.length + 8);
  if (/[¥￥$]\s*$/.test(before)) return false;
  if (/^\s*(?:元|美元|USD|CNY)/i.test(after)) return false;
  if (/^\.\d/.test(after)) return false;
  if (/^(19|20)\d{2}$/.test(code)) {
    const around = text.slice(Math.max(0, at - 2), at + code.length + 2);
    if (/[年/\-.]|月/.test(around)) return false;
    if (!/(?:验证码|校验码|密码|code|otp)\s*(?:是|为)?\s*[：:]?\s*$/i.test(before)) return false;
  }
  const aroundStart = Math.max(0, at - 16);
  const around = text.slice(aroundStart, at + code.length + 16);
  const phone = around.match(/1[3-9]\d{9}|400-?\d{3}-?\d{4}/);
  if (phone && phone.index !== undefined) {
    const phoneAt = aroundStart + phone.index;
    if (at >= phoneAt && at < phoneAt + phone[0].length) return false;
  }
  const left = text.slice(Math.max(0, at - 14), at);
  if (/(订单号|订单|单号|运单|快递单号|金额|电话|手机号|order(?:\s+number)?|tracking)/i.test(left) && !/(验证码|校验码|code|otp|密码)/i.test(left)) {
    return false;
  }
  return true;
}

function fromPatterns(text: string): CodeHit | null {
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text))) {
      const code = match[1];
      const at = match.index + match[0].lastIndexOf(code);
      if (plausible(code, text, at)) return { code, keyword: pattern.keyword };
      if (match.index === pattern.re.lastIndex) pattern.re.lastIndex += 1;
    }
  }
  return null;
}

function fromWindow(text: string): CodeHit | null {
  const lower = text.toLowerCase();
  let best: { code: string; keyword: string; score: number } | null = null;
  for (const keyword of KEYWORDS) {
    let from = 0;
    const needle = keyword.toLowerCase();
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      from = at + needle.length;
      const windowText = text.slice(at, Math.min(text.length, at + 90));
      const token = /(?<![A-Za-z0-9])([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g;
      let found: RegExpExecArray | null;
      while ((found = token.exec(windowText))) {
        const code = found[1];
        const absolute = at + found.index;
        if (!plausible(code, text, absolute)) continue;
        let score = 30;
        if (found.index <= needle.length + 6) score += 40;
        if (code.length === 6) score += 15;
        if (/[A-Za-z]/.test(code) && /steam|guard/.test(needle)) score += 20;
        if (!best || score > best.score) best = { code, keyword, score };
      }
    }
  }
  return best && best.score >= 40 ? { code: best.code, keyword: best.keyword } : null;
}

export function extractVerificationCode(input: string): CodeHit | null {
  const text = normalizeMailText(input);
  return fromPatterns(text) ?? fromWindow(text);
}
