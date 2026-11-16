import { describe, expect, it } from "vitest";
import { classifySpam } from "../src/shared/spam";
import { extractMailHeaders } from "../src/shared/mail";

const base = { from: "Someone <a@example.com>", subject: "你好", text: "这是一封普通邮件，没有什么特别的。", classification: "none" as const };

describe("classifySpam", () => {
  it("普通邮件低分、类型 normal", () => {
    const verdict = classifySpam(base);
    expect(verdict.spamScore).toBe(0);
    expect(verdict.contentKind).toBe("normal");
  });

  it("用户拉黑的域名直接 90 分", () => {
    const verdict = classifySpam({ ...base, userBlocked: true });
    expect(verdict.spamScore).toBe(90);
    expect(verdict.contentKind).toBe("spammy");
  });

  it("邮件头层：SPF/DKIM/DMARC 失败叠加", () => {
    const verdict = classifySpam({ ...base, headers: { spf: "fail", dkim: "fail", dmarc: "fail" } });
    expect(verdict.spamScore).toBe(70);
    expect(verdict.contentKind).toBe("spammy");
    expect(verdict.spamReasons.map((r) => r.delta)).toEqual([25, 25, 20]);
  });

  it("认证全过减分，回信路径不一致加分", () => {
    const good = classifySpam({ ...base, headers: { spf: "pass", dkim: "pass" } });
    expect(good.spamScore).toBe(0);
    expect(good.spamReasons[0].delta).toBe(-15);
    const mismatch = classifySpam({ ...base, headers: { returnPathDomain: "other.net" } });
    expect(mismatch.spamScore).toBe(15);
  });

  it("诈骗话术按类叠加，紧迫话术再加", () => {
    const verdict = classifySpam({
      ...base,
      subject: "恭喜您获得大奖",
      text: "恭喜您获得现金红包待领取！稳赚不赔，日入过万，还可代开发票，立即验证否则账户将被关闭。",
    });
    expect(verdict.spamScore).toBeGreaterThanOrEqual(42);
    expect(verdict.spamReasons.some((r) => r.label.includes("紧迫"))).toBe(true);
  });

  it("仿冒品牌链接重罚", () => {
    const verdict = classifySpam({ ...base, text: "请登录 https://paypa1.com/verify 确认您的账户信息。" });
    expect(verdict.spamScore).toBe(22);
  });

  it("高置信验证码 + 认证齐全时风险封顶 45", () => {
    const verdict = classifySpam({
      ...base,
      classification: "code",
      headers: { spf: "pass", dkim: "pass", returnPathDomain: "other.net" },
      subject: "中奖通知",
      text: "恭喜您获得红包，稳赚不赔，代开发票，在线博彩，验证码 123456，立即验证否则账户将被关闭 https://paypa1.com/x",
    });
    expect(verdict.spamScore).toBe(45);
    expect(verdict.contentKind).not.toBe("spammy");
  });

  it("内容轴：推广 / 订阅 / 重要通知", () => {
    expect(classifySpam({ ...base, headers: { listUnsubscribe: true }, text: "限时促销，全场五折。" }).contentKind).toBe("promo");
    expect(classifySpam({ ...base, subject: "产品周刊第 12 期", text: "这是您的订阅周刊。" }).contentKind).toBe("subscription");
    expect(classifySpam({ ...base, subject: "登录提醒", text: "您的账户刚刚在新设备登录，如非本人操作请修改密码。" }).contentKind).toBe("important");
  });
});

describe("extractMailHeaders", () => {
  it("从 Authentication-Results 里摘出三项结果", () => {
    const headers = new Map<string, unknown>([
      ["authentication-results", { value: "mx.qq.com; spf=pass smtp.mailfrom=example.com; dkim=fail; dmarc=pass" }],
      ["return-path", { value: "<bounce@other.net>" }],
      ["list-unsubscribe", { value: "<https://example.com/unsub>" }],
    ]);
    const snapshot = extractMailHeaders(headers);
    expect(snapshot.spf).toBe("pass");
    expect(snapshot.dkim).toBe("fail");
    expect(snapshot.dmarc).toBe("pass");
    expect(snapshot.returnPathDomain).toBe("other.net");
    expect(snapshot.listUnsubscribe).toBe(true);
  });

  it("没有认证头时只给退订标记", () => {
    const snapshot = extractMailHeaders(new Map());
    expect(snapshot.spf).toBeUndefined();
    expect(snapshot.listUnsubscribe).toBe(false);
  });
});
