import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "tests/fixtures/codes");
fs.mkdirSync(root, { recursive: true });

const sample = (partial) => partial;

function htmlWrap(title, sentence, code) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f3f3f3"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Segoe UI,sans-serif"><tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:700">${title}</td></tr><tr><td style="padding:8px 32px 16px;font-size:15px;line-height:1.5;color:#333">${sentence}</td></tr><tr><td align="center" style="padding:8px 32px 24px"><table><tr><td style="font-size:32px;font-weight:700;letter-spacing:4px;padding:12px 24px;background:#f7f7f7">${code}</td></tr></table></td></tr><tr><td style="padding:0 32px 28px;font-size:12px;color:#777">如果这不是你的操作，可以忽略这封邮件。</td></tr></table></td></tr></table></body></html>`;
}

const legacy = [
  ["legacy-qq", "zh-Hans", "QQ邮箱 <10000@qq.com>", "邮箱验证", "QQ：您正在进行邮箱验证，验证码：582916，有效期 5 分钟。", "582916", "code"],
  ["legacy-netease", "zh-Hans", "网易 <noreply@163.com>", "验证码", "网易：您好，您的验证码为 193847，用于登录。", "193847", "code"],
  ["legacy-126", "zh-Hans", "126 <noreply@126.com>", "校验码", "126：校验码是 102938。", "102938", "code"],
  ["legacy-alipay", "zh-Hans", "支付宝 <notify@alipay.com>", "支付宝", "【支付宝】您的验证码是738291，打死都不要告诉别人哦！", "738291", "code"],
  ["legacy-wechat", "zh-Hans", "微信 <weixin@tencent.com>", "微信", "【微信】验证码102938（10分钟内有效）。您正在登录微信。", "102938", "code"],
  ["legacy-dynamic", "zh-Hans", "安全 <secure@example.com>", "动态密码", "动态密码：884422", "884422", "code"],
  ["legacy-otp-zh", "zh-Hans", "安全 <secure@example.com>", "一次性密码", "一次性密码 445566，请及时输入。", "445566", "code"],
  ["legacy-after", "zh-Hans", "安全 <secure@example.com>", "验证码", "123456 是您的验证码", "123456", "code"],
  ["legacy-google", "en", "Google <noreply@google.com>", "Google", "Your Google verification code is 847291", "847291", "code"],
  ["legacy-g", "en", "Google <noreply@google.com>", "Google", "G-482913 is your Google verification code.", "482913", "code"],
  ["legacy-ms", "en", "Microsoft <noreply@microsoft.com>", "Microsoft", "Microsoft account security code: 918273", "918273", "code"],
  ["legacy-own", "en", "Microsoft <noreply@microsoft.com>", "Sign in", "The verification code to continue signing in is:\n\n219384\n\nThis code will expire soon.", "219384", "code"],
  ["legacy-apple", "en", "Apple <noreply@apple.com>", "Apple ID", "Your Apple ID Code is: 654321. Don't share it with anyone.", "654321", "code"],
  ["legacy-steam", "en", "Steam <noreply@steampowered.com>", "Steam Guard", "Here's the Steam Guard code you need to login: R7K2M", "R7K2M", "code"],
  ["legacy-otp", "en", "Auth <noreply@example.com>", "OTP", "Your OTP is 445566. It expires in 5 minutes.", "445566", "code"],
  ["legacy-onetime", "en", "Auth <noreply@example.com>", "One-time password", "One-time password: AB12CD", "AB12CD", "code"],
  ["legacy-year", "zh-Hans", "安全 <secure@example.com>", "验证码", "请在 2026 年前使用验证码 883311 完成验证。", "883311", "code"],
  ["legacy-year2", "zh-Hans", "安全 <secure@example.com>", "验证码", "验证码已于2024年11月发送，请使用 661203。", "661203", "code"],
  ["legacy-mixed", "zh-Hans", "客服 <help@example.com>", "验证码", "验证码：582916。如有问题请致电 13800138000。订单 2024110899 已创建，金额 86.50元。", "582916", "code"],
  ["legacy-fullwidth", "zh-Hans", "安全 <secure@example.com>", "验证码", "验证码：５８２９１６", "582916", "code"],
  ["legacy-newline", "zh-Hans", "安全 <secure@example.com>", "验证码", "验证码\n\n582910", "582910", "code"],
  ["legacy-html", "zh-Hans", "安全 <secure@example.com>", "验证码", "<div>您的验证码是 <b>582916</b></div><p>订单号 202411120001</p>", "582916", "code"],
  ["legacy-order-en", "en", "Shop <orders@shop.example>", "Your order", "Your order #A10293847 total $12.50 was placed on Nov 12, 2024. Zip code 100080. Error code 404.", null, "none"],
  ["legacy-order-zh", "zh-Hans", "商店 <orders@shop.example>", "订单", "您的订单号：202411120001，金额 ¥199.00，下单日期 2024年11月12日，客服电话 400-800-1234，手机 13812345678。", null, "none"],
  ["legacy-error", "en", "CI <ci@example.com>", "Build", "error code: 4041", null, "none"],
  ["legacy-status", "en", "API <api@example.com>", "Status", "status code: 5000", null, "none"],
  ["legacy-zip", "en", "Shop <orders@shop.example>", "Address", "Zip code 100080", null, "none"],
  ["legacy-source", "zh-Hans", "Docs <docs@example.com>", "Docs", "请阅读 source code 和 area code 010。", null, "none"],
  ["legacy-plain", "zh-Hans", "商店 <orders@shop.example>", "发货", "没有验证码的普通通知，订单已发货。", null, "none"],
].map(([id, lang, from, subject, text, expected, kind]) => sample({ id, lang, from, subject, text, expected, kind, note: "migrated from extract tests" }));

const bugs = [
  sample({ id: "bug-promo", lang: "en", from: "Deals <deals@shop.example>", subject: "20% off", text: "Your promo code: SAVE20 for 20% off", expected: null, kind: "none", note: "SAVE20 must not alert" }),
  sample({ id: "bug-invite", lang: "zh-Hans", from: "增长 <hello@example.com>", subject: "邀请", text: "验证码10分钟内有效…邀请码 ABC123", expected: null, kind: "none", note: "invite code only" }),
  sample({ id: "bug-reference", lang: "en", from: "Auth <noreply@example.com>", subject: "verification code", text: "verification code … Reference 2A9F3C. Code 771234", expected: "771234", kind: "code", note: "reference must lose to Code" }),
  sample({ id: "bug-hant", lang: "zh-Hant", from: "安全 <secure@example.com>", subject: "驗證碼", text: "您的驗證碼是 482913，10 分鐘內有效。", expected: "482913", kind: "code", note: "zh-Hant" }),
  sample({ id: "bug-ja", lang: "ja", from: "サポート <noreply@example.jp>", subject: "認証コード", text: "認証コードは 482913 です。", expected: "482913", kind: "code", note: "ja" }),
  sample({ id: "bug-ko", lang: "ko", from: "보안 <noreply@example.kr>", subject: "인증번호", text: "인증번호 482913 를 입력해 주세요.", expected: "482913", kind: "code", note: "ko" }),
  sample({ id: "bug-es", lang: "es", from: "Seguridad <noreply@example.es>", subject: "código", text: "Tu código de verificación es 482913.", expected: "482913", kind: "code", note: "es" }),
  sample({ id: "bug-de", lang: "de", from: "Sicherheit <noreply@example.de>", subject: "Bestätigungscode", text: "Ihr Bestätigungscode lautet 482913.", expected: "482913", kind: "code", note: "de" }),
  sample({ id: "bug-grouped", lang: "en", from: "Auth <noreply@example.com>", subject: "Your code", text: "Your code: 123-456", expected: "123456", kind: "code", note: "grouped digits" }),
  sample({ id: "bug-letters", lang: "en", from: "Auth <noreply@example.com>", subject: "Enter this code", text: "Enter this code: ABCDEF", expected: "ABCDEF", kind: "code", note: "pure letters" }),
  sample({ id: "bug-use", lang: "en", from: "Auth <noreply@example.com>", subject: "Verify", text: "Use code 482913 to verify", expected: "482913", kind: "code", note: "use code" }),
  sample({ id: "pattern-type", lang: "en", from: "Auth <noreply@example.com>", subject: "Type this code", text: "Type the following code: 482913", expected: "482913", kind: "code", note: "type the following code" }),
  sample({ id: "pattern-is-your", lang: "en", from: "Auth <noreply@example.com>", subject: "Code", text: "482913 is your code", expected: "482913", kind: "code", note: "X is your code" }),
  sample({ id: "pattern-space", lang: "en", from: "Auth <noreply@example.com>", subject: "Your code", text: "Your code: 123 456", expected: "123456", kind: "code", note: "grouped space" }),
  sample({ id: "pattern-abc", lang: "en", from: "Auth <noreply@example.com>", subject: "Enter code", text: "Enter this code: ABC-123", expected: "ABC123", kind: "code", note: "ABC-123" }),
];

const providers = [
  ["qq-1", "zh-Hans", "QQ邮箱 <10000@qq.com>", "QQ 邮箱验证", "您正在登录 QQ 邮箱，验证码见下方。", "582916"],
  ["qq-2", "zh-Hans", "QQ邮箱 <10000@qq.com>", "QQ 安全验证", "请输入验证码完成 QQ 登录。", "193847"],
  ["netease-1", "zh-Hans", "网易邮箱 <noreply@163.com>", "网易邮箱验证码", "您好，您的验证码为下方数字，用于登录。", "102938"],
  ["netease-2", "zh-Hans", "网易邮箱 <noreply@126.com>", "126 校验码", "校验码见下表，请在 10 分钟内输入。", "884422"],
  ["alipay-1", "zh-Hans", "支付宝 <notify@service.alipay.com>", "支付宝验证码", "您正在登录支付宝。验证码如下，请勿告诉他人。", "738291"],
  ["alipay-2", "zh-Hans", "支付宝 <notify@service.alipay.com>", "支付宝安全校验", "校验码用于本次登录。", "445566"],
  ["wechat-1", "zh-Hans", "微信团队 <weixin@tencent.com>", "微信登录验证", "您正在登录微信，验证码 10 分钟内有效。", "219384"],
  ["wechat-2", "zh-Hans", "微信团队 <weixin@tencent.com>", "微信安全码", "请填写下面的验证码。", "654321"],
  ["google-1", "en", "Google <noreply@accounts.google.com>", "Google verification code", "Your Google verification code is below.", "847291"],
  ["google-2", "en", "Google <noreply@accounts.google.com>", "Sign in to Google", "Use this verification code to continue.", "918273"],
  ["microsoft-1", "en", "Microsoft account team <account-security-noreply@accountprotection.microsoft.com>", "Microsoft security code", "Your Microsoft account security code is below.", "661203"],
  ["microsoft-2", "en", "Microsoft <noreply@accountprotection.microsoft.com>", "Finish signing in", "Enter the security code below to finish signing in.", "305571"],
  ["apple-1", "en", "Apple <noreply@email.apple.com>", "Your Apple ID code", "Your Apple ID code is below. Don't share it.", "774410"],
  ["apple-2", "en", "Apple <noreply@id.apple.com>", "Apple ID", "Use this Apple ID code to verify it's you.", "229015"],
  ["steam-1", "en", "Steam Support <noreply@steampowered.com>", "Steam Guard", "Here is the Steam Guard code you need to login.", "R7K2M"],
  ["steam-2", "en", "Steam <noreply@steampowered.com>", "Steam Guard code", "Steam Guard code for this login:", "K4M9Q"],
  ["github-1", "en", "GitHub <noreply@github.com>", "GitHub verification code", "Your GitHub authentication code is below.", "582916"],
  ["github-2", "en", "GitHub <noreply@github.com>", "GitHub sign-in", "Use this verification code to finish signing in to GitHub.", "193847"],
].map(([id, lang, from, subject, sentence, code]) => sample({
  id, lang, from, subject,
  text: `${sentence} ${code}`,
  html: htmlWrap(subject, sentence, code),
  expected: code,
  kind: "code",
  note: "provider HTML template",
}));

const languages = [
  ["zh-Hant", "驗證碼", "您的驗證碼是", "noreply@example.tw"],
  ["ja", "認証コード", "認証コードは", "noreply@example.jp"],
  ["ko", "인증번호", "인증번호", "noreply@example.kr"],
  ["es", "código de verificación", "Tu código de verificación es", "noreply@example.es"],
  ["pt", "código de verificação", "Seu código de verificação é", "noreply@example.pt"],
  ["de", "Bestätigungscode", "Ihr Bestätigungscode lautet", "noreply@example.de"],
  ["fr", "code de vérification", "Votre code de vérification est", "noreply@example.fr"],
  ["ru", "код подтверждения", "Ваш код подтверждения:", "noreply@example.ru"],
];
const langCodes = ["482913", "661908", "330291"];
const langSamples = [];
for (const [lang, keyword, sentence, from] of languages) {
  langCodes.forEach((code, index) => {
    const text = lang === "ko" && index === 1
      ? `인증 코드 ${code} 를 입력해 주세요.`
      : lang === "ko" && index === 2
        ? `확인 코드 ${code}`
        : `${sentence} ${code}`;
    langSamples.push(sample({
      id: `lang-${lang}-${index}`,
      lang,
      from: `Security <${from}>`,
      subject: keyword,
      text,
      expected: code,
      kind: "code",
      note: `${lang} keyword`,
    }));
  });
}

const links = Array.from({ length: 12 }, (_, index) => {
  const zh = index % 2 === 0;
  return sample({
    id: `link-${index}`,
    lang: zh ? "zh-Hans" : "en",
    from: zh ? "产品 <hello@product.example>" : "Notion <notify@notion.example>",
    subject: zh ? "请验证邮箱" : "Verify your email",
    text: zh
      ? `点击链接验证你的邮箱，链接 24 小时内有效。\nhttps://example.com/confirm-email/${index}`
      : `Verify your email to finish creating your account.\nhttps://example.com/verify/${index}`,
    html: zh
      ? `<p>点击链接验证你的邮箱。</p><p><a href="https://example.com/confirm-email/${index}">验证邮箱</a></p>`
      : `<p>Verify your email address.</p><p><a href="https://example.com/verify/${index}">Verify email</a></p>`,
    expected: null,
    kind: "link",
    note: "link verification",
  });
});

const noise = [];
for (let index = 0; index < 16; index += 1) {
  noise.push(sample({
    id: `noise-order-${index}`,
    lang: "zh-Hans",
    from: "商店 <orders@shop.example>",
    subject: `订单 ${100860 + index} 已发货`,
    text: `您的订单号 202411${String(120000 + index)} 已交给快递。运单 SF${1000000000 + index}。金额 ¥${88 + index}.00。`,
    html: `<table><tr><td>订单号</td><td>202411${String(120000 + index)}</td></tr><tr><td>金额</td><td>¥${88 + index}.00</td></tr><tr><td>运单</td><td>SF${1000000000 + index}</td></tr></table>`,
    expected: null,
    kind: "none",
    note: "order",
  }));
  noise.push(sample({
    id: `noise-bill-${index}`,
    lang: "en",
    from: "Billing <billing@shop.example>",
    subject: `Receipt ${44000 + index}`,
    text: `Order number A${10000000 + index}. Total $${12 + index}.50. Tracking number 1Z${900000 + index}. Reference R${700000 + index}. Zip code 100080.`,
    expected: null,
    kind: "none",
    note: "bill",
  }));
  noise.push(sample({
    id: `noise-promo-${index}`,
    lang: "zh-Hans",
    from: "营销 <deals@shop.example>",
    subject: "优惠到账",
    text: `优惠码 OFF${20 + (index % 30)}，邀请码 INV${1000 + index}。型号 A${index}。这是促销邮件。`,
    html: `<p>本周折扣</p><a href="https://shop.example/sale/${index}">Shop the sale</a><p>promo code SAVE${20 + index}</p>`,
    expected: null,
    kind: "none",
    note: "marketing",
  }));
  if (index < 8) {
    noise.push(sample({
      id: `noise-ticket-${index}`,
      lang: "zh-Hans",
      from: "支持 <support@example.com>",
      subject: `工单 #${8000 + index}`,
      text: `工单 ${8000 + index} 有新回复。票号 TKT${50000 + index}。请在帮助中心查看。`,
      expected: null,
      kind: "none",
      note: "ticket",
    }));
  }
}
noise.push(sample({
  id: "noise-tail",
  lang: "zh-Hans",
  from: "银行 <bill@bank.example>",
  subject: "账单",
  text: "您尾号 4388 的账户于 11 月 12 日消费 86.50 元。",
  expected: null,
  kind: "none",
  note: "account tail",
}));
noise.push(sample({
  id: "noise-version",
  lang: "zh-Hans",
  from: "产品 <news@example.com>",
  subject: "更新说明",
  text: "版本 2.14.3 已发布。型号 1016 只是内部编号。",
  expected: null,
  kind: "none",
  note: "version",
}));

const all = { legacy, bugs, providers, languages: langSamples, links, noise };
for (const [name, rows] of Object.entries(all)) {
  fs.writeFileSync(path.join(root, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`);
}
const count = Object.values(all).reduce((sum, rows) => sum + rows.length, 0);
console.log(`wrote ${count} samples`);
