import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../src/main/store.js";
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

  it("历史记录只保留 20 条", () => {
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
    expect(store.history).toHaveLength(20);
    expect(store.history[0].code).toBe("100024");
  });
});
