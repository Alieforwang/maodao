import { describe, expect, it } from "vitest";
import { mergeMailBodies } from "../src/shared/mail.js";

describe("邮件正文去重", () => {
  it("纯文本和 HTML 内容相同时只保留一份，HTML 仍单独留下", () => {
    const html = "<p>您的验证码是 <b>582916</b></p>";
    const merged = mergeMailBodies("您的验证码是 582916", html);
    expect(merged.html).toBe(html);
    expect(merged.text.match(/582916/g)?.length).toBe(1);
  });

  it("两边内容不同时都保留", () => {
    const merged = mergeMailBodies("纯文本里的验证码 111111", "<p>HTML 里的另一段说明</p>");
    expect(merged.text).toContain("111111");
    expect(merged.text).toContain("另一段说明");
  });
});
