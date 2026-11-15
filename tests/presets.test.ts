import { describe, expect, it } from "vitest";
import { buildImapOptions, forceImapId } from "../src/main/monitor.js";
import { needsImapId, normalizePassword } from "../src/shared/presets.js";
import { explainImapError } from "../src/shared/redact.js";
import { readJwtEmail } from "../src/main/oauth.js";
import type { Account } from "../src/shared/types.js";

describe("邮箱预设", () => {
  it("网易系服务器会强制发送 IMAP ID", () => {
    expect(needsImapId("imap.163.com")).toBe(true);
    expect(needsImapId("imap.126.com")).toBe(true);
    expect(needsImapId("imap.yeah.net")).toBe(true);
    expect(needsImapId("imap.qq.com")).toBe(false);
    expect(needsImapId("imap.gmail.com")).toBe(false);
    const map = new Map<string, unknown>();
    const client = { capabilities: map };
    forceImapId(client);
    expect(client.capabilities.has("ID")).toBe(true);
    client.capabilities = new Map();
    expect(client.capabilities.has("ID")).toBe(true);
    expect(client.capabilities.has("IDLE")).toBe(false);
  });

  it("Gmail、QQ、网易凭证去掉全部空白，连接选项不记录日志", () => {
    expect(normalizePassword("gmail", "abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizePassword("gmail", "aaaa\nbbbb\r\ncccc\u3000dddd")).toBe("aaaabbbbccccdddd");
    expect(normalizePassword("qq", "qqqq wwww\neeee\u3000rrrr")).toBe("qqqqwwwweeeerrrr");
    expect(normalizePassword("netease", "1633\t1633 1633")).toBe("163316331633");
    const spaced = "aaaa bbbb\u3000cccc";
    const gmailAccount: Account = {
      id: "1",
      provider: "gmail",
      email: "a@gmail.com",
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      authMethod: "password",
      enabled: true,
      secretUpdatedAt: 1,
      secretPersisted: true,
    };
    expect(buildImapOptions(gmailAccount, { password: spaced }).auth).toEqual({ user: "a@gmail.com", pass: "aaaabbbbcccc" });
    const account: Account = {
      id: "1",
      provider: "gmail",
      email: "a@gmail.com",
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      authMethod: "password",
      enabled: true,
      secretUpdatedAt: 1,
      secretPersisted: true,
    };
    const options = buildImapOptions(account, { password: "abcdefghijklmnop" });
    expect(options.logger).toBe(false);
    expect(options.logRaw).toBe(false);
    expect(options.auth).toEqual({ user: "a@gmail.com", pass: "abcdefghijklmnop" });
    expect(options.clientInfo.name).toBe("Madao");
  });

  it("Outlook 使用 XOAUTH2 访问令牌而不是密码", () => {
    const account: Account = {
      id: "1",
      provider: "outlook",
      email: "a@outlook.com",
      host: "outlook.office365.com",
      port: 993,
      secure: true,
      authMethod: "oauth",
      enabled: true,
      secretUpdatedAt: 1,
      secretPersisted: true,
    };
    const options = buildImapOptions(account, { accessToken: "token-value" });
    expect(options.auth).toEqual({ user: "a@outlook.com", accessToken: "token-value" });
    const aliased = buildImapOptions({ ...account, imapUser: "login@qq.com" }, { accessToken: "token-value" });
    expect(aliased.auth).toEqual({ user: "login@qq.com", accessToken: "token-value" });
    expect(JSON.stringify(options)).not.toContain("pass");
  });

  it("Gmail 登录失败时说明可能是应用专用密码或未开启 IMAP", () => {
    const error = Object.assign(new Error("Invalid credentials"), { authenticationFailed: true });
    expect(explainImapError(error, "gmail")).toBe("Gmail 登录失败。可能是应用专用密码不正确，或 Gmail 未开启 IMAP。");
    expect(explainImapError(new Error("connection reset"), "gmail")).toBe("连接中断，将自动重试。");
  });

  it("从身份令牌里读取邮箱", () => {
    const payload = Buffer.from(JSON.stringify({ preferred_username: "a@outlook.com" })).toString("base64url");
    expect(readJwtEmail(`aaa.${payload}.bbb`)).toBe("a@outlook.com");
  });
});
