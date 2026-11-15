import { describe, expect, it } from "vitest";
import { toRedactedFixture } from "../src/shared/fixtureExport.js";

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
});