import { describe, expect, it } from "vitest";
import { buildImapOptions, forceImapId } from "../src/main/monitor.js";
import { needsImapId, normalizePassword } from "../src/shared/presets.js";
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

  it("Gmail 应用专用密码去掉空格，连接选项不记录日志", () => {
    expect(normalizePassword("gmail", "abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
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
    expect(JSON.stringify(options)).not.toContain("pass");
  });

  it("从身份令牌里读取邮箱", () => {
    const payload = Buffer.from(JSON.stringify({ preferred_username: "a@outlook.com" })).toString("base64url");
    expect(readJwtEmail(`aaa.${payload}.bbb`)).toBe("a@outlook.com");
  });
});
