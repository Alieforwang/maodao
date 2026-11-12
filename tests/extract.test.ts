import { describe, expect, it } from "vitest";
import { extractVerificationCode } from "../src/shared/extract.js";

const cases: Array<[string, string | null]> = [
  ["QQ：您正在进行邮箱验证，验证码：582916，有效期 5 分钟。", "582916"],
  ["网易：您好，您的验证码为 193847，用于登录。", "193847"],
  ["126：校验码是 102938。", "102938"],
  ["【支付宝】您的验证码是738291，打死都不要告诉别人哦！", "738291"],
  ["【微信】验证码102938（10分钟内有效）。您正在登录微信。", "102938"],
  ["动态密码：884422", "884422"],
  ["一次性密码 445566，请及时输入。", "445566"],
  ["123456 是您的验证码", "123456"],
  ["Your Google verification code is 847291", "847291"],
  ["G-482913 is your Google verification code.", "482913"],
  ["Microsoft account security code: 918273", "918273"],
  ["The verification code to continue signing in is:\n\n219384\n\nThis code will expire soon.", "219384"],
  ["Your Apple ID Code is: 654321. Don't share it with anyone.", "654321"],
  ["Here's the Steam Guard code you need to login: R7K2M", "R7K2M"],
  ["Your OTP is 445566. It expires in 5 minutes.", "445566"],
  ["One-time password: AB12CD", "AB12CD"],
  ["请在 2026 年前使用验证码 883311 完成验证。", "883311"],
  ["验证码已于2024年11月发送，请使用 661203。", "661203"],
  ["验证码：582916。如有问题请致电 13800138000。订单 2024110899 已创建，金额 86.50元。", "582916"],
  ["验证码：５８２９１６", "582916"],
  ["验证码\n\n582910", "582910"],
  ["<div>您的验证码是 <b>582916</b></div><p>订单号 202411120001</p>", "582916"],
  ["Your order #A10293847 total $12.50 was placed on Nov 12, 2024. Zip code 100080. Error code 404.", null],
  ["您的订单号：202411120001，金额 ¥199.00，下单日期 2024年11月12日，客服电话 400-800-1234，手机 13812345678。", null],
  ["error code: 4041", null],
  ["status code: 5000", null],
  ["Zip code 100080", null],
  ["请阅读 source code 和 area code 010。", null],
  ["没有验证码的普通通知，订单已发货。", null],
];

describe("验证码识别", () => {
  it.each(cases)("%s", (text, expected) => {
    expect(extractVerificationCode(text)?.code ?? null).toBe(expected);
  });

  it("不会把手机号的一段当成验证码", () => {
    expect(extractVerificationCode("手机13812345678，验证码 661203")?.code).toBe("661203");
  });

  it("验证码可以是 4 位或 8 位", () => {
    expect(extractVerificationCode("验证码 1029")?.code).toBe("1029");
    expect(extractVerificationCode("verification code is 12345678")?.code).toBe("12345678");
  });
});
