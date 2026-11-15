import { describe, expect, it } from "vitest";
import { redactSensitive, toRedactedFixture } from "../src/shared/fixtureExport.js";
import { classifyFixture, loadFixtures } from "./codeFixtures.js";

describe("脱敏样本", () => {
  it("导出成样本 JSON，不含收件地址、手机号和令牌", () => {
    const fixture = toRedactedFixture({
      from: "支付宝 <notify@service.alipay.com>",
      subject: "验证码",
      text: "验证码是 738291。收件人 ada@example.com，手机 13800138000。access_token=super-secret-token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      html: "<p>验证码是 <b>738291</b></p><p>ada@example.com</p>",
      expected: "738291",
      kind: "code",
      recipient: "ada@example.com",
    });
    const dumped = JSON.stringify(fixture);
    expect(dumped).not.toContain("ada@example.com");
    expect(dumped).not.toContain("13800138000");
    expect(dumped).not.toContain("super-secret-token");
    expect(dumped).not.toContain("eyJhbGci");
    expect(fixture.from).toBe("notify@service.alipay.com");
    expect(fixture.expected).toBe("738291");
    expect(fixture.kind).toBe("code");
    expect(fixture.text).toContain("738291");
    expect(fixture.lang).toBe("zh-Hans");
  });

  it("去掉链接令牌、编码后的邮箱、跟踪像素和国际电话", () => {
    const text = [
      "Please verify your email: https://link.example/verify?token=abcDEF123456xyz",
      "pixel https://px.example/open.gif?rcpt=ada%40example.com",
      "path https://link.example/v/0123456789abcdef0123456789abcdef",
      "phone +1 (415) 555-0123",
    ].join("\n");
    const fixture = toRedactedFixture({
      from: "Verify <notify@link.example>",
      subject: "Verify your email",
      text,
      expected: null,
      kind: "link",
      recipient: "ada@example.com",
    });
    const dumped = JSON.stringify(fixture);
    expect(dumped).not.toContain("abcDEF123456xyz");
    expect(dumped).not.toContain("ada%40example.com");
    expect(dumped).not.toContain("ada@example.com");
    expect(dumped).not.toContain("0123456789abcdef0123456789abcdef");
    expect(dumped).not.toContain("555-0123");
    expect(dumped).toContain("https://link.example");
  });

  it("去掉 Bearer 头、不带协议的链接、token、sk- 密钥、美国本地号码和编码邮箱", () => {
    const cases: Array<[string, string]> = [
      ["Authorization: Bearer abcdef1234567890xyz", "abcdef1234567890xyz"],
      ["www.link.example/verify?token=abcDEF123456xyz", "abcDEF123456xyz"],
      ["Your token: XyZ12345abcQ", "XyZ12345abcQ"],
      ["sk-live-SECRETKEY1234567890", "SECRETKEY1234567890"],
      ["Call (415) 555-0123 today", "555-0123"],
      ["write ada%2540example.com outside", "ada%2540example.com"],
      ["mailbox YWRhQGV4YW1wbGUuY29t", "YWRhQGV4YW1wbGUuY29t"],
    ];
    for (const [input, secret] of cases) {
      expect(redactSensitive(input, "ada@example.com")).not.toContain(secret);
    }
    expect(redactSensitive("验证码 482913，还有 123-456 和 00482913", "ada@example.com")).toContain("482913");
    expect(redactSensitive("验证码 482913，还有 123-456 和 00482913")).toContain("123-456");
    expect(redactSensitive("验证码 482913，还有 123-456 和 00482913")).toContain("00482913");
  });

  it("脱敏后再识别，样本里的码和类型不变", () => {
    for (const sample of loadFixtures()) {
      const redacted = {
        ...sample,
        subject: redactSensitive(sample.subject),
        text: redactSensitive(sample.text || ""),
        html: sample.html ? redactSensitive(sample.html) : undefined,
      };
      expect(classifyFixture(redacted)).toEqual(classifyFixture(sample));
    }
  });
});