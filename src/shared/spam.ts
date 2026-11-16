import { senderDomain } from "./extract.js";
import type { ContentKind, MailClass, MailHeaders, SpamReason } from "./types.js";

export interface SpamInput {
  from: string;
  subject: string;
  text: string;
  headers?: MailHeaders;
  /** Code-axis classification, used by the anti-false-positive cap. */
  classification: MailClass;
  /** The user marked this sender domain as not-a-code / muted. */
  userBlocked?: boolean;
}

export interface SpamVerdict {
  contentKind: ContentKind;
  spamScore: number;
  spamReasons: SpamReason[];
}

const SCAM_GROUPS: Array<{ label: string; words: string[] }> = [
  { label: "中奖/返利话术", words: ["中奖", "恭喜您获得", "免费领取", "现金红包待领取", "lucky winner", "you have won", "claim your prize"] },
  { label: "稳赚/投资诈骗话术", words: ["稳赚不赔", "日入过万", "带你赚钱", "高额回报", "刷单", "兼职刷单", "crypto investment", "guaranteed profit"] },
  { label: "灰产服务话术", words: ["代开发票", "代办证件", "出售账号", "出国劳务包过", "vpn出售"] },
  { label: "博彩/贷款话术", words: ["在线博彩", "棋牌游戏充值", "贷款秒到账", "无抵押贷款点此", "casino bonus"] },
];

const URGENCY = ["立即验证否则", "马上冻结", "账户将被关闭", "账户将被冻结", "24小时内完成验证", "最后机会", "act now", "account will be closed", "verify immediately or"];

const PROMO_WORDS = ["促销", "优惠", "折扣", "限时特惠", "大促", "满减", "秒杀", "sale", "off today", "% off", "discount"];
const SUBSCRIPTION_WORDS = ["周刊", "月刊", "订阅", "newsletter", "weekly digest", "每日速递", "电子报"];
const IMPORTANT_WORDS = ["账单", "支付成功", "付款成功", "扣款", "安全提醒", "登录提醒", "异地登录", "订单已发货", "快递已签收", "发票已开具", "工资", "社保", "银行", "payment received", "your receipt", "security alert", "sign-in alert"];

const SHORTENERS = ["bit.ly", "t.cn", "dwz.cn", "suo.im", "tinyurl.com", "goo.gl", "reurl.cc", "ppt.cc"];
const BRAND_LOOKALIKE = /(paypa1|app1e|micros0ft|amaz0n|g00gle|faceb00k|a1ipay|ta0bao|jd\.com-|\.top\b|\.xyz\b|\.click\b)/i;

function urlsIn(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"')]+/gi) || [];
}

/**
 * Local, explainable junk scoring — the design's layers 0–2 (user list, headers, content/links).
 * Layer 3 (on-device Bayes from user corrections) is intentionally not faked here.
 * Nothing is ever deleted: the score only labels and folds mail in the All Mail view.
 */
export function classifySpam(input: SpamInput): SpamVerdict {
  const reasons: SpamReason[] = [];
  let score = 0;
  const add = (label: string, delta: number) => {
    if (!delta) return;
    score += delta;
    reasons.push({ label, delta });
  };
  const headers = input.headers || {};
  const fromDomain = senderDomain(input.from);
  const haystack = `${input.subject}\n${input.text}`.slice(0, 8000);
  const lower = haystack.toLowerCase();

  // Layer 0 — the user's own list beats everything.
  if (input.userBlocked) {
    return { contentKind: "spammy", spamScore: 90, spamReasons: [{ label: "你已把这个发件域名标为不提醒", delta: 90 }] };
  }

  // Layer 1 — authentication & routing headers.
  if (headers.spf === "fail") add("SPF 校验失败（发件服务器未被授权）", 25);
  else if (headers.spf === "softfail") add("SPF 软失败", 10);
  if (headers.dkim === "fail") add("DKIM 签名校验失败", 25);
  if (headers.dmarc === "fail") add("DMARC 校验失败", 20);
  if (headers.spf === "pass" && headers.dkim === "pass") add("SPF 与 DKIM 均通过", -15);
  if (headers.returnPathDomain && fromDomain && headers.returnPathDomain !== fromDomain) {
    add("回信路径域名与发件域名不一致", 15);
  }

  // Layer 2 — content and link structure.
  let scamHits = 0;
  for (const group of SCAM_GROUPS) {
    if (group.words.some((word) => lower.includes(word.toLowerCase()))) {
      scamHits += 1;
      add(group.label, 10);
      if (scamHits >= 3) break;
    }
  }
  if (URGENCY.some((word) => lower.includes(word.toLowerCase()))) add("制造紧迫感的话术", 12);
  const urls = urlsIn(haystack);
  if (urls.some((url) => BRAND_LOOKALIKE.test(url))) add("链接域名疑似仿冒品牌", 22);
  if (urls.some((url) => SHORTENERS.some((host) => url.toLowerCase().includes(host)))) {
    if (input.text.trim().length < 300) add("正文很短却使用短链接", 18);
    else add("使用短链接隐藏真实地址", 8);
  }
  if (urls.length >= 4) add(`正文包含 ${urls.length} 个链接`, 8);

  // Anti-false-positive cap: a confidently recognised code from an authenticated sender is not junk.
  if (input.classification === "code" && headers.spf === "pass" && headers.dkim === "pass" && score > 45) {
    reasons.push({ label: "高置信验证码且认证齐全，风险封顶 45", delta: 45 - score });
    score = 45;
  }
  score = Math.max(0, Math.min(100, score));

  // Content axis.
  let contentKind: ContentKind = "normal";
  if (score >= 60) contentKind = "spammy";
  else if (SUBSCRIPTION_WORDS.some((word) => lower.includes(word.toLowerCase()))) contentKind = "subscription";
  else if (headers.listUnsubscribe || PROMO_WORDS.some((word) => lower.includes(word.toLowerCase()))) contentKind = "promo";
  else if (IMPORTANT_WORDS.some((word) => lower.includes(word.toLowerCase()))) contentKind = "important";
  return { contentKind, spamScore: score, spamReasons: reasons };
}

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  important: "重要通知",
  promo: "推广",
  subscription: "订阅",
  normal: "普通",
  spammy: "疑似垃圾",
};
