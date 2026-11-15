const RULES: Array<[RegExp, string]> = [
  [/支付宝|alipay/, "支付宝"],
  [/微信|wechat|weixin/, "微信"],
  [/github/, "GitHub"],
  [/steam/, "Steam"],
  [/apple|icloud/, "Apple"],
  [/google|gmail/, "Google"],
  [/microsoft|outlook|hotmail|live\.com/, "Microsoft"],
  [/qq\.com|腾讯/, "腾讯"],
  [/163\.com|126\.com|yeah\.net|网易/, "网易"],
  [/discord/, "Discord"],
  [/openai/, "OpenAI"],
  [/amazon/, "Amazon"],
  [/paypal/, "PayPal"],
  [/slack/, "Slack"],
];

/** Known mail hosts. Matched only on the From domain, never on an account id. */
export const SENDER_TEMPLATES: Array<{ domain: string; length: number }> = [
  { domain: "qq.com", length: 6 },
  { domain: "163.com", length: 6 },
  { domain: "126.com", length: 6 },
  { domain: "yeah.net", length: 6 },
  { domain: "alipay.com", length: 6 },
  { domain: "tencent.com", length: 6 },
  { domain: "google.com", length: 6 },
  { domain: "microsoft.com", length: 6 },
  { domain: "apple.com", length: 6 },
  { domain: "steampowered.com", length: 5 },
  { domain: "github.com", length: 6 },
];

export function senderTemplate(from: string): { domain: string; length: number } | undefined {
  const match = from.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  const host = (match?.[1] || "").toLowerCase();
  if (!host) return undefined;
  return SENDER_TEMPLATES.find((item) => host === item.domain || host.endsWith(`.${item.domain}`));
}

export function inferService(from: string, subject: string, body: string): string {
  const blob = `${from}\n${subject}\n${body.slice(0, 800)}`.toLowerCase();
  for (const [pattern, name] of RULES) {
    if (pattern.test(blob)) return name;
  }
  const display = from.split("<")[0]?.replace(/["]/g, "").trim();
  return display ? display.slice(0, 40) : "未知发件人";
}
