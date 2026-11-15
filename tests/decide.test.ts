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

  it("静音过的发件域名不再弹出验证码", () => {
    const decision = decideNotification({ ...base, senderPrefs: { "alipay.com": { muted: true } } });
    expect(decision).toMatchObject({ action: "skip", reason: "muted" });
  });

  it("链接验证邮件给出打开按钮需要的地址，但不是验证码", () => {
    const decision = decideNotification({
      ...base,
      subject: "Verify your email",
      body: "Verify your email address.\nhttps://example.com/verify/finish",
    });
    expect(decision.action).toBe("notify");
    if (decision.action === "notify") {
      expect(decision.reason).toBe("link");
      expect(decision.code).toBeNull();
      expect(decision.verifyUrl).toBe("https://example.com/verify/finish");
    }
  });

  it("复制必须来自用户动作", () => {
    expect(isCopyReason("notification-click")).toBe(true);
    expect(isCopyReason("copy-button")).toBe(true);
    expect(isCopyReason("auto")).toBe(false);
  });
});
