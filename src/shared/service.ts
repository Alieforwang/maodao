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

export function inferService(from: string, subject: string, body: string): string {
  const blob = `${from}\n${subject}\n${body.slice(0, 800)}`.toLowerCase();
  for (const [pattern, name] of RULES) {
    if (pattern.test(blob)) return name;
  }
  const display = from.split("<")[0]?.replace(/["]/g, "").trim();
  return display ? display.slice(0, 40) : "未知发件人";
}
