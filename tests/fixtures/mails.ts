export interface MailSample {
  id: string;
  subject: string;
  from: string;
  text: string;
  html?: string;
  /** Copy-form code. Null means no verification code. */
  expect: string | null;
  /** Link-verification mail. It should popup, but not as a code. */
  link?: boolean;
}

interface Built {
  subject: string;
  from: string;
  text: string;
  html?: string;
}

function codeMail(id: string, expect: string, mail: Built): MailSample {
  return { id, expect, ...mail };
}

function noise(id: string, mail: Built): MailSample {
  return { id, expect: null, ...mail };
}

function linkMail(id: string, mail: Built): MailSample {
  return { id, expect: null, link: true, ...mail };
}

const POSITIVE_TEMPLATES: Array<[string, string, string, (code: string) => Built]> = [
  ["google", "Google", "accounts.google.com", (code) => ({
    subject: "您的 Google 验证码",
    from: "Google <noreply@accounts.google.com>",
    text: `您的 Google 验证码是 ${code}。此验证码将在 10 分钟后失效。如果不是您本人操作，请忽略这封邮件。`,
  })],
  ["microsoft", "Microsoft", "accountprotection.microsoft.com", (code) => ({
    subject: "Microsoft account security code",
    from: "Microsoft account team <account-security-noreply@accountprotection.microsoft.com>",
    text: `Microsoft account security code: ${code}\n\nUse this code to finish signing in. It expires in 15 minutes.`,
  })],
  ["apple", "Apple", "id.apple.com", (code) => ({
    subject: "Your Apple ID code",
    from: "Apple <noreply@email.apple.com>",
    text: `Your Apple ID Code is: ${code}. Don't share it with anyone.`,
  })],
  ["steam", "Steam", "steampowered.com", (code) => ({
    subject: "Steam Guard code",
    from: "Steam Support <noreply@steampowered.com>",
    text: `Here is the Steam Guard code you need to login: ${code}`,
  })],
  ["github", "GitHub", "github.com", (code) => ({
    subject: "Your GitHub verification code",
    from: "GitHub <noreply@github.com>",
    text: `${code} is your GitHub authentication code.\n\nThis code expires in 15 minutes.`,
  })],
  ["discord", "Discord", "discord.com", (code) => ({
    subject: "Your Discord login code",
    from: "Discord <noreply@discord.com>",
    text: `Your Discord verification code is ${code}. Enter it to finish logging in.`,
  })],
  ["openai", "OpenAI", "openai.com", (code) => ({
    subject: "OpenAI verification code",
    from: "OpenAI <noreply@tm.openai.com>",
    text: `Your OpenAI verification code is ${code}. This code will expire in 10 minutes.`,
  })],
  ["alipay", "支付宝", "alipay.com", (code) => ({
    subject: "支付宝验证码",
    from: "支付宝 <notify@service.alipay.com>",
    text: `【支付宝】您的验证码是${code}，打死都不要告诉别人哦！`,
  })],
  ["wechat", "微信", "weixin.qq.com", (code) => ({
    subject: "微信登录验证",
    from: "微信团队 <weixin@tencent.com>",
    text: `【微信】验证码${code}（10分钟内有效）。您正在登录微信。`,
  })],
  ["qq", "QQ", "qq.com", (code) => ({
    subject: "QQ 邮箱验证",
    from: "QQ邮箱 <10000@qq.com>",
    text: `您正在进行邮箱验证，验证码：${code}，有效期 5 分钟。`,
  })],
  ["netease", "网易", "163.com", (code) => ({
    subject: "网易邮箱验证码",
    from: "网易邮箱 <noreply@163.com>",
    text: `您好，您的验证码为 ${code}，用于登录网易邮箱。`,
  })],
  ["amazon", "Amazon", "amazon.com", (code) => ({
    subject: "Amazon authentication",
    from: "Amazon <account-update@amazon.com>",
    text: `Your Amazon verification code is ${code}. We will never ask you to share it.`,
  })],
  ["paypal", "PayPal", "paypal.com", (code) => ({
    subject: "PayPal security code",
    from: "PayPal <service@paypal.com>",
    text: `PayPal security code: ${code}. Enter this code to confirm it's you.`,
  })],
  ["slack", "Slack", "slack.com", (code) => ({
    subject: "Slack confirmation code",
    from: "Slack <notification@slack.com>",
    text: `Your Slack confirmation code is ${code}.`,
  })],
];

const CODES = ["582916", "193847", "102938", "738291", "884422", "445566", "219384", "654321", "918273", "661203", "482913", "305571", "774410", "229015"];

const HAND: MailSample[] = [
  codeMail("edge-qq", "582916", { subject: "邮箱验证", from: "QQ邮箱 <10000@qq.com>", text: "QQ：您正在进行邮箱验证，验证码：582916，有效期 5 分钟。" }),
  codeMail("edge-netease", "193847", { subject: "验证码", from: "网易 <noreply@163.com>", text: "网易：您好，您的验证码为 193847，用于登录。" }),
  codeMail("edge-126", "102938", { subject: "校验码", from: "126 <noreply@126.com>", text: "126：校验码是 102938。" }),
  codeMail("edge-alipay", "738291", { subject: "支付宝", from: "支付宝 <notify@alipay.com>", text: "【支付宝】您的验证码是738291，打死都不要告诉别人哦！" }),
  codeMail("edge-wechat", "102938", { subject: "微信", from: "微信 <weixin@qq.com>", text: "【微信】验证码102938（10分钟内有效）。您正在登录微信。" }),
  codeMail("edge-dynamic", "884422", { subject: "动态密码", from: "安全中心 <secure@example.com>", text: "动态密码：884422" }),
  codeMail("edge-otp-zh", "445566", { subject: "一次性密码", from: "安全中心 <secure@example.com>", text: "一次性密码 445566，请及时输入。" }),
  codeMail("edge-after", "123456", { subject: "验证码", from: "安全中心 <secure@example.com>", text: "123456 是您的验证码" }),
  codeMail("edge-google-en", "847291", { subject: "Google", from: "Google <noreply@google.com>", text: "Your Google verification code is 847291" }),
  codeMail("edge-google-g", "482913", { subject: "Google", from: "Google <noreply@google.com>", text: "G-482913 is your Google verification code." }),
  codeMail("edge-ms", "918273", { subject: "Microsoft", from: "Microsoft <noreply@microsoft.com>", text: "Microsoft account security code: 918273" }),
  codeMail("edge-own-line", "219384", { subject: "Sign in", from: "Microsoft <noreply@microsoft.com>", text: "The verification code to continue signing in is:\n\n219384\n\nThis code will expire soon." }),
  codeMail("edge-apple", "654321", { subject: "Apple ID", from: "Apple <noreply@apple.com>", text: "Your Apple ID Code is: 654321. Don't share it with anyone." }),
  codeMail("edge-steam", "R7K2M", { subject: "Steam Guard", from: "Steam <noreply@steampowered.com>", text: "Here's the Steam Guard code you need to login: R7K2M" }),
  codeMail("edge-otp", "445566", { subject: "OTP", from: "Auth <noreply@example.com>", text: "Your OTP is 445566. It expires in 5 minutes." }),
  codeMail("edge-onetime", "AB12CD", { subject: "One-time password", from: "Auth <noreply@example.com>", text: "One-time password: AB12CD" }),
  codeMail("edge-year", "883311", { subject: "验证码", from: "安全 <secure@example.com>", text: "请在 2026 年前使用验证码 883311 完成验证。" }),
  codeMail("edge-year-2", "661203", { subject: "验证码", from: "安全 <secure@example.com>", text: "验证码已于2024年11月发送，请使用 661203。" }),
  codeMail("edge-mixed", "582916", { subject: "验证码", from: "客服 <help@example.com>", text: "验证码：582916。如有问题请致电 13800138000。订单 2024110899 已创建，金额 86.50元。" }),
  codeMail("edge-fullwidth", "582916", { subject: "验证码", from: "安全 <secure@example.com>", text: "验证码：５８２９１６" }),
  codeMail("edge-newline", "582910", { subject: "验证码", from: "安全 <secure@example.com>", text: "验证码\n\n582910" }),
  codeMail("edge-html", "582916", { subject: "验证码", from: "安全 <secure@example.com>", text: "<div>您的验证码是 <b>582916</b></div><p>订单号 202411120001</p>" }),
  codeMail("edge-phone", "661203", { subject: "验证码", from: "安全 <secure@example.com>", text: "手机13812345678，验证码 661203" }),
  codeMail("edge-4", "1029", { subject: "验证码", from: "安全 <secure@example.com>", text: "验证码 1029" }),
  codeMail("edge-8", "12345678", { subject: "code", from: "Auth <noreply@example.com>", text: "verification code is 12345678" }),
  codeMail("bug-invite-real", "582910", { subject: "验证码", from: "增长 <hello@example.com>", text: "您的验证码是 582910，10分钟内有效。邀请码 ABC123" }),
  codeMail("bug-reference", "771234", { subject: "verification code", from: "Auth <noreply@example.com>", text: "verification code … Reference 2A9F3C. Code 771234" }),
  codeMail("bug-reference-full", "771234", { subject: "Sign-in code", from: "Auth <noreply@example.com>", text: "Your verification code is below. Reference 2A9F3C. Code 771234" }),
  codeMail("i18n-hant", "661908", { subject: "驗證碼", from: "安全 <secure@example.com>", text: "您的驗證碼是 661908，10 分鐘內有效。" }),
  codeMail("i18n-ja", "448120", { subject: "認証コード", from: "サポート <noreply@example.jp>", text: "認証コードは 448120 です。他人に教えないでください。" }),
  codeMail("i18n-ko", "902144", { subject: "인증번호", from: "보안 <noreply@example.kr>", text: "인증번호 902144 를 입력해 주세요. 10분 후 만료됩니다." }),
  codeMail("i18n-es", "330291", { subject: "código de verificación", from: "Seguridad <noreply@example.es>", text: "Tu código de verificación es 330291. Caduca en 10 minutos." }),
  codeMail("i18n-de", "229184", { subject: "Bestätigungscode", from: "Sicherheit <noreply@example.de>", text: "Ihr Bestätigungscode lautet 229184. Geben Sie ihn nicht weiter." }),
  codeMail("i18n-fr", "771045", { subject: "code de vérification", from: "Sécurité <noreply@example.fr>", text: "Votre code de vérification est 771045. Il expire dans 10 minutes." }),
  codeMail("i18n-ru", "664120", { subject: "код подтверждения", from: "Безопасность <noreply@example.ru>", text: "Ваш код подтверждения: 664120. Никому его не сообщайте." }),
  codeMail("i18n-pt", "881236", { subject: "código de verificação", from: "Segurança <noreply@example.pt>", text: "Seu código de verificação é 881236. Ele expira em 10 minutos." }),
  codeMail("grouped-digits", "123456", { subject: "Your code", from: "Auth <noreply@example.com>", text: "Your code: 123-456" }),
  codeMail("grouped-letters", "ABC123", { subject: "Enter code", from: "Auth <noreply@example.com>", text: "Enter this code: ABC 123" }),
  codeMail("pure-letters", "ABCDEF", { subject: "Enter this code", from: "Auth <noreply@example.com>", text: "Enter this code: ABCDEF" }),
  codeMail("use-code", "482913", { subject: "Verify", from: "Auth <noreply@example.com>", text: "Use code 482913 to verify" }),
  codeMail("subject-only", "556677", { subject: "验证码 556677", from: "安全 <secure@example.com>", text: "如果不是你的操作，可以忽略这封邮件。" }),
  codeMail("subject-keyword-body-line", "440291", { subject: "您的验证码", from: "安全 <secure@example.com>", text: "请在页面输入下面的数字。\n\n440291\n\n10 分钟内有效。" }),
  codeMail("bold-html", "918273", { subject: "Security code", from: "Microsoft <noreply@microsoft.com>", html: `<p>Your security code is</p><p style="font-size:32px">918273</p>`, text: "Your security code is\n918273" }),
  noise("bug-promo", { subject: "20% off", from: "Deals <deals@shop.example>", text: "Your promo code: SAVE20 for 20% off" }),
  noise("bug-invite-only", { subject: "邀请好友", from: "增长 <hello@example.com>", text: "验证码10分钟内有效…邀请码 ABC123" }),
  noise("order-en", { subject: "Your order", from: "Shop <orders@shop.example>", text: "Your order #A10293847 total $12.50 was placed on Nov 12, 2024. Zip code 100080. Error code 404." }),
  noise("order-zh", { subject: "订单已发货", from: "商店 <orders@shop.example>", text: "您的订单号：202411120001，金额 ¥199.00，下单日期 2024年11月12日，客服电话 400-800-1234，手机 13812345678。" }),
  noise("error-code", { subject: "Build failed", from: "CI <ci@example.com>", text: "error code: 4041" }),
  noise("status-code", { subject: "Status", from: "API <api@example.com>", text: "status code: 5000" }),
  noise("zip", { subject: "Address", from: "Shop <orders@shop.example>", text: "Zip code 100080" }),
  noise("source", { subject: "Docs", from: "Docs <docs@example.com>", text: "请阅读 source code 和 area code 010。" }),
  noise("plain", { subject: "发货通知", from: "商店 <orders@shop.example>", text: "没有验证码的普通通知，订单已发货。" }),
  noise("cross-join", { subject: "验证码", from: "商店 <orders@shop.example>", text: "订单号 582910 已发货，预计明天送达。" }),
  noise("tail", { subject: "账单", from: "银行 <bill@bank.example>", text: "您尾号 4388 的账户于 11 月 12 日消费 86.50 元。" }),
  noise("version", { subject: "更新说明", from: "产品 <news@example.com>", text: "版本 2.14.3 已发布。版本号 1016 只是内部构建号，无需输入。" }),
  noise("ticket", { subject: "工单更新", from: "支持 <support@example.com>", text: "工单 884422 已有回复，请登录查看，无需验证码。" }),
  noise("tracking", { subject: "物流", from: "快递 <ship@example.com>", text: "运单 SF1234567890 已揽收。tracking number 1Z999AA10123456784." }),
  noise("reference-only", { subject: "Receipt", from: "账单 <billing@example.com>", text: "Reference 2A9F3C. Thank you for your purchase of $20.00." }),
  noise("coupon", { subject: "优惠", from: "商店 <deals@shop.example>", text: "优惠码 SAVE20，下单立减 20 元。邀请码 HELLO1 可转给朋友。" }),
  noise("redeem", { subject: "兑换", from: "商店 <deals@shop.example>", text: "兑换码 GIFT88 已放入卡包，不是登录用的验证码。" }),
  noise("html-noise", { subject: "周报", from: "新闻 <news@example.com>", html: `<style>.code{color:#5A6B7C}</style><table><tr><td class="code-582916">本周没有需要你处理的验证。</td></tr></table>`, text: "本周没有需要你处理的验证。" }),
  noise("date-price", { subject: "发票", from: "财务 <billing@example.com>", text: "发票日期 2024-11-12，金额 1,299.00 元，发票号 INV202411120099。" }),
  noise("account-id", { subject: "账户", from: "银行 <bill@bank.example>", text: "账户编号 882910 已更新预留手机，这不是验证码。" }),
];

const NOISE_TEMPLATES: Array<(index: number) => Built> = [
  (index) => ({
    subject: `订单 ${100860 + index} 已发货`,
    from: "商店 <orders@shop.example>",
    text: `您的订单号 202411${String(120000 + index)} 已交给快递。运单 SF${1000000000 + index}。金额 ¥${88 + index}.00。预计 11 月 ${10 + (index % 15)} 日送达。`,
  }),
  (index) => ({
    subject: `Your receipt ${44000 + index}`,
    from: "Billing <billing@shop.example>",
    text: `Order number A${10000000 + index}. Total $${12 + index}.50. Tracking number 1Z${900000 + index}. Reference R${700000 + index}. Zip code 100080.`,
  }),
  (index) => ({
    subject: "优惠到账",
    from: "营销 <deals@shop.example>",
    text: `优惠码 OFF${20 + (index % 30)}，满 100 减 ${10 + index}。邀请码 INV${1000 + index}。这是促销邮件，不需要输入验证码。`,
  }),
  (index) => ({
    subject: `工单 #${8000 + index}`,
    from: "支持 <support@example.com>",
    text: `工单 ${8000 + index} 有新回复。票号 TKT${50000 + index}。请在帮助中心查看，不要把工单号当作验证码。`,
  }),
];

const LINK_TEMPLATES: Array<(index: number) => Built> = [
  (index) => ({
    subject: "Verify your email",
    from: "Notion <notify@notion.so>",
    text: `Verify your email to finish creating your account.\nhttps://example.com/verify/${index}`,
  }),
  (index) => ({
    subject: "请验证邮箱",
    from: "产品 <hello@product.example>",
    text: `点击链接验证你的邮箱，链接 24 小时内有效。\nhttps://example.com/confirm-email/${index}`,
  }),
];

export const MAIL_SAMPLES: MailSample[] = [...HAND];

for (const [id, , , build] of POSITIVE_TEMPLATES) {
  CODES.slice(0, 8).forEach((code, index) => {
    if (id === "steam" && index > 2) return;
    const value = id === "steam" ? ["R7K2M", "K4M9Q", "T8N2P"][index] : code;
    MAIL_SAMPLES.push(codeMail(`${id}-${index}`, value, build(value)));
  });
}

for (let index = 0; index < 20; index += 1) {
  for (const build of NOISE_TEMPLATES) MAIL_SAMPLES.push(noise(`noise-${MAIL_SAMPLES.length}`, build(index)));
  if (index < 8) {
    for (const build of LINK_TEMPLATES) MAIL_SAMPLES.push(linkMail(`link-${MAIL_SAMPLES.length}`, build(index)));
  }
}

export const REQUIRED_SAMPLES = [
  "Your promo code: SAVE20 for 20% off",
  "验证码10分钟内有效…邀请码 ABC123",
  "verification code … Reference 2A9F3C. Code 771234",
  "驗證碼",
  "認証コード",
  "인증번호",
  "código",
  "Bestätigungscode",
  "Your code: 123-456",
  "Enter this code: ABCDEF",
  "Use code 482913 to verify",
];
