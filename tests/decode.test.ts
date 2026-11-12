import { describe, expect, it } from "vitest";
import { decodeBase64Utf8, decodeQuotedPrintable, htmlToText } from "../src/shared/decode.js";
import { extractVerificationCode } from "../src/shared/extract.js";
import { parseRawMail } from "../src/shared/mail.js";

describe("邮件解码", () => {
  it("还原 quoted-printable 中文", () => {
    const text = decodeQuotedPrintable("=E9=AA=8C=E8=AF=81=E7=A0=81=EF=BC=9A582916");
    expect(text).toContain("验证码");
    expect(extractVerificationCode(text)?.code).toBe("582916");
  });

  it("还原 base64 正文", () => {
    const raw = Buffer.from("验证码：193847", "utf8").toString("base64");
    expect(extractVerificationCode(decodeBase64Utf8(raw))?.code).toBe("193847");
  });

  it("去掉 HTML 标签和实体", () => {
    const text = htmlToText("<p>验证码&#65306;<b>654321</b></p>");
    expect(extractVerificationCode(text)?.code).toBe("654321");
  });

  it("解析 quoted-printable HTML 邮件", async () => {
    const eml = [
      "From: Alipay <notify@alipay.com>",
      "Subject: =?UTF-8?B?6aqM6K+B56CB?=",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<p>=E9=AA=8C=E8=AF=81=E7=A0=81=EF=BC=9A<b>738291</b></p>",
    ].join("\r\n");
    const parsed = await parseRawMail(eml);
    expect(extractVerificationCode(`${parsed.subject}\n${parsed.text}`)?.code).toBe("738291");
  });
});
