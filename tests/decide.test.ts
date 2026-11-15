import { describe, expect, it } from "vitest";
import { decideNotification } from "../src/shared/decide.js";
import { isCopyReason } from "../src/shared/types.js";

const base = {
  subject: "登录验证",
  from: "Alipay <notify@alipay.com>",
  body: "您的验证码是 738291",
  internalDate: 1_000_000,
  now: 1_000_000,
  uid: 8,
  baselineUid: 7,
  maxAgeMs: 5 * 60_000,
  notifyAllMail: false,
  alreadyNotified: false,
};

describe("新邮件策略", () => {
  it("新邮件里的验证码会通知，结果里没有复制动作", () => {
    const decision = decideNotification(base);
    expect(decision.action).toBe("notify");
    if (decision.action === "notify") {
      expect(decision.code).toBe("738291");
      expect(decision.service).toBe("支付宝");
      expect(decision).not.toHaveProperty("copied");
    }
  });

  it("启动时超出时间窗的历史邮件不通知", () => {
    const decision = decideNotification({ ...base, uid: 3, baselineUid: 7, internalDate: base.now - 10 * 60_000 });
    expect(decision).toMatchObject({ action: "skip", reason: "backlog" });
  });

  it("启动时时间窗内的邮件可以通知", () => {
    const decision = decideNotification({ ...base, uid: 3, baselineUid: 7, internalDate: base.now - 60_000 });
    expect(decision.action).toBe("notify");
  });

  it("没有验证码的新邮件默认不弹", () => {
    expect(decideNotification({ ...base, body: "您的订单已发货" }).action).toBe("skip");
  });

  it("打开全部新邮件后，没有验证码也会通知", () => {
    const decision = decideNotification({ ...base, body: "您的订单已发货", notifyAllMail: true });
    expect(decision).toMatchObject({ action: "notify", code: null, reason: "all-mail" });
  });

  it("同一封邮件不重复通知", () => {
    expect(decideNotification({ ...base, alreadyNotified: true })).toMatchObject({ action: "skip", reason: "already-notified" });
  });

  it("分组验证码按原样显示，复制时去掉分隔符", () => {
    const decision = decideNotification({ ...base, subject: "Your code", from: "Auth <noreply@example.com>", body: "Your code: 123-456" });
    expect(decision).toMatchObject({ action: "notify", reason: "code", code: "123456", display: "123-456" });
  });

  it("拿不准时弹出候选，低置信不弹", () => {
    const medium = decideNotification({ ...base, subject: "Code", from: "Auth <noreply@example.com>", body: "Code 771234. Code 882211." });
    expect(medium.action).toBe("notify");
    if (medium.action === "notify") {
      expect(medium.reason).toBe("maybe");
      expect(medium.candidates.map((item) => item.code)).toEqual(expect.arrayContaining(["771234", "882211"]));
    }
    expect(decideNotification({ ...base, body: "订单号 202411120001 已发货" }).action).toBe("skip");
  });

  it("链接验证会通知地址，但不是验证码", () => {
    const decision = decideNotification({
      ...base,
      subject: "Verify your email",
      from: "Notion <notify@notion.example>",
      body: "Verify your email address.\nhttps://example.com/verify/finish",
    });
    expect(decision).toMatchObject({ action: "notify", reason: "link", code: null, verifyUrl: "https://example.com/verify/finish" });
  });

  it("静音的发件域名不再弹出，偏好按域名而不是账号", () => {
    const muted = decideNotification({ ...base, senderPrefs: { "alipay.com": { muted: true } } });
    expect(muted).toMatchObject({ action: "skip", reason: "muted" });
    const preferred = decideNotification({
      ...base,
      subject: "Code",
      from: "Auth <noreply@example.com>",
      body: "Code 771234. Code 882211.",
      senderPrefs: { "example.com": { preferIndex: 1 } },
    });
    if (preferred.action === "notify") expect(preferred.selectedIndex).toBe(1);
  });

  it("复制必须来自用户动作", () => {
    expect(isCopyReason("notification-click")).toBe(true);
    expect(isCopyReason("copy-button")).toBe(true);
    expect(isCopyReason("auto")).toBe(false);
  });
});
