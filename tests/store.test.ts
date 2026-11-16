import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../src/main/store.js";
import { DEFAULT_SETTINGS } from "../src/shared/types.js";
import type { SecretBox } from "../src/shared/secrets.js";
import { unavailableSecretBox } from "../src/shared/secrets.js";

const dirs: string[] = [];

function hexBox(): SecretBox {
  return {
    available: true,
    encrypt: (plain) => Buffer.from(plain, "utf8").toString("hex"),
    decrypt: (payload) => Buffer.from(payload, "hex").toString("utf8"),
  };
}

function tempStore(box: SecretBox): AccountStore {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-"));
  dirs.push(directory);
  const store = new AccountStore(directory, box);
  store.load();
  return store;
}

afterEach(() => {
  for (const directory of dirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("凭据存储", () => {
  it("授权码不以明文写入任何文件", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-"));
    dirs.push(directory);
    const store = new AccountStore(directory, hexBox());
    store.load();
    store.saveAccount({ provider: "qq", email: "a@qq.com", host: "imap.qq.com", port: 993, secret: "super-secret-auth-code" });
    const files = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
    expect(files).not.toContain("super-secret-auth-code");
    expect(store.getSecret(store.accounts[0].id)?.password).toBe("super-secret-auth-code");
  });

  it("系统不能加密时不把授权码写到磁盘", () => {
    const store = tempStore(unavailableSecretBox());
    const account = store.saveAccount({ provider: "gmail", email: "a@gmail.com", host: "imap.gmail.com", port: 993, secret: "abcd efgh ijkl mnop" });
    expect(account.secretPersisted).toBe(false);
    expect(store.getSecret(account.id)?.password).toBe("abcdefghijklmnop");
    const names = fs.readdirSync(path.dirname(fs.realpathSync(process.cwd()))).length;
    void names;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-none-"));
    dirs.push(directory);
    const plain = new AccountStore(directory, unavailableSecretBox());
    plain.load();
    plain.saveAccount({ provider: "qq", email: "b@qq.com", host: "imap.qq.com", port: 993, secret: "do-not-write" });
    const dumped = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
    expect(dumped).not.toContain("do-not-write");
    expect(fs.existsSync(path.join(directory, "secrets.json"))).toBe(false);
  });

  it("历史记录保留 7 天内、最多 200 条（改版前是只留 20 条）", () => {
    const store = tempStore(hexBox());
    for (let index = 0; index < 25; index += 1) {
      store.addHistory({
        id: String(index),
        accountId: "a",
        email: "a@qq.com",
        code: String(100000 + index),
        service: "测试",
        subject: "验证码",
        from: "test",
        messageId: String(index),
        receivedAt: index,
      });
    }
    expect(store.history).toHaveLength(25);
    expect(store.history[0].code).toBe("100024");
  });

  it("重新登录同一个 Outlook 邮箱时保留账号和备注", () => {
    const store = tempStore(hexBox());
    const first = store.saveOAuthAccount({ email: "a@outlook.com", accessToken: "tok-1", refreshToken: "ref-1" });
    store.setAlias(first.id, "工作");
    const second = store.saveOAuthAccount({
      email: "a@outlook.com",
      loginName: "a@qq.com",
      accessToken: "tok-2",
      refreshToken: "ref-2",
      replaceId: first.id,
    });
    expect(store.accounts).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.alias).toBe("工作");
    expect(second.loginName).toBe("a@qq.com");
    expect(store.getSecret(first.id)?.accessToken).toBe("tok-2");
  });

  it("1.0.5 的 Outlook 账号没有新字段也能读出来", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-old-"));
    dirs.push(directory);
    fs.writeFileSync(path.join(directory, "config.json"), JSON.stringify({
      version: 1,
      settings: {
        openAtLogin: false,
        startMinimized: false,
        notifyOnlyCodes: true,
        sound: true,
        notificationSeconds: 30,
        maxAgeMinutes: 5,
        outlookClientId: "",
        outlookTenant: "consumers",
        oauthRedirectPort: 45832,
        oauthRedirectUri: "",
        autoCheckUpdates: true,
      },
      accounts: [{
        id: "old",
        provider: "outlook",
        email: "old@outlook.com",
        host: "outlook.office365.com",
        port: 993,
        secure: true,
        authMethod: "oauth",
        enabled: true,
        secretUpdatedAt: 1,
        secretPersisted: true,
      }],
      history: [],
      seen: [],
    }));
    const store = new AccountStore(directory, hexBox());
    store.load();
    expect(store.accounts[0].email).toBe("old@outlook.com");
    expect(store.accounts[0].loginName).toBeUndefined();
    expect(store.accounts).toHaveLength(1);
  });

  it("发件域名校正记在设置里，删掉账号或重新打开仍然在", () => {
    const store = tempStore(hexBox());
    const account = store.saveAccount({ provider: "qq", email: "a@qq.com", host: "imap.qq.com", port: 993, secret: "auth-code" });
    store.updateSettings({ senderPrefs: { "shop.example": { muted: true, preferIndex: 1 } } });
    store.deleteAccount(account.id);
    expect(store.accounts).toHaveLength(0);
    expect(store.settings.senderPrefs["shop.example"]).toEqual({ muted: true, preferIndex: 1 });
    const directory = (store as unknown as { directory: string }).directory;
    const reloaded = new AccountStore(directory, hexBox());
    reloaded.load();
    expect(reloaded.settings.senderPrefs["shop.example"]?.muted).toBe(true);
    expect(reloaded.settings.senderPrefs["a@qq.com"]).toBeUndefined();
    expect(reloaded.settings.openAtLogin).toBe(DEFAULT_SETTINGS.openAtLogin);
  });

  it("AI 密钥加密保存，不写进配置文件", () => {
    const store = tempStore(hexBox());
    expect(store.setAiKey("sk-test-key-not-real")).toBe(true);
    const directory = (store as unknown as { directory: string }).directory;
    const dumped = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
    expect(dumped).not.toContain("sk-test-key-not-real");
    expect(store.getAiKey()).toBe("sk-test-key-not-real");
    expect(store.settings.aiEnabled).toBe(false);
  });
});

describe("学习层（1.4.0）", () => {
  function storedMail(store: AccountStore, partial: Record<string, unknown> = {}) {
    return store.recordMail({
      id: "mail-1",
      accountId: "a1",
      email: "me@qq.com",
      from: "云服务 <billing@cloud.example>",
      subject: "账单",
      text: "正文",
      receivedAt: Date.now(),
      classification: "none",
      confidence: "low",
      source: "rule",
      code: null,
      display: null,
      candidates: [],
      displays: [],
      domain: "cloud.example",
      contentKind: "spammy",
      spamScore: 82,
      spamReasons: [{ label: "营销话术命中", delta: 10 }],
      ...partial,
    } as never);
  }

  it("correctMailSpam 标为非垃圾：降分改类型、写入发件人记忆、计数推翻", () => {
    const store = tempStore(unavailableSecretBox);
    storedMail(store);
    const result = store.correctMailSpam("mail-1", false);
    expect(result?.mail.contentKind).toBe("normal");
    expect(result?.mail.spamScore).toBeLessThanOrEqual(30);
    expect(result?.learned.corrections).toBe(1);
    expect(store.spamAdjustFor("云服务 <billing@cloud.example>").sender).toBeLessThan(0);
    expect(store.learningSummary().precision.overturned).toBe(1);
    expect(result?.mail.spamReasons?.at(-1)?.label).toContain("你的纠正");
  });

  it("applyAiClassification 写入裁决、账本与每日计数", () => {
    const store = tempStore(unavailableSecretBox);
    storedMail(store, { contentKind: "normal", spamScore: 55 });
    const updated = store.applyAiClassification("mail-1", { contentKind: "spammy", spamScore: 78, reason: "仿冒域名" }, 1200);
    expect(updated?.contentKind).toBe("spammy");
    expect(updated?.aiJudged).toBe(true);
    expect(updated?.spamReasons?.at(-1)?.label).toContain("AI 裁决");
    const summary = store.learningSummary();
    expect(summary.aiToday.calls).toBe(1);
    expect(summary.aiToday.changed).toBe(1);
    expect(summary.precision.judged).toBe(1);
  });

  it("学习状态随配置持久化，重载后仍在", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-"));
    dirs.push(directory);
    const store = new AccountStore(directory, unavailableSecretBox);
    store.load();
    storedMail(store);
    store.correctMailSpam("mail-1", false);
    const reloaded = new AccountStore(directory, unavailableSecretBox);
    reloaded.load();
    expect(reloaded.learning.corrections).toBe(1);
    expect(reloaded.spamAdjustFor("billing@cloud.example").sender).toBeLessThan(0);
  });
});
