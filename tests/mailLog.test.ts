import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AccountStore } from "../src/main/store.js";
import { toRedactedFixture } from "../src/shared/fixtureExport.js";
import { correctionPreference, filterMails, pruneMails, sanitizeMailText } from "../src/shared/mailLog.js";
import { unavailableSecretBox } from "../src/shared/secrets.js";
import type { MailSummary, StoredMail } from "../src/shared/types.js";

function mail(partial: Partial<StoredMail> & Pick<StoredMail, "id" | "accountId" | "receivedAt">): StoredMail {
  return {
    email: "a@qq.com",
    from: "商店 <news@shop.example>",
    subject: "标题",
    text: "正文 482913",
    classification: "none",
    confidence: "low",
    source: "rule",
    code: null,
    display: null,
    candidates: [],
    displays: [],
    domain: "shop.example",
    ...partial,
  };
}

describe("全部邮件", () => {
  it("按时间和每个邮箱的数量裁剪", () => {
    const now = Date.parse("2026-11-15T00:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const kept = pruneMails([
      mail({ id: "old", accountId: "a", receivedAt: now - 40 * day }),
      mail({ id: "new-1", accountId: "a", receivedAt: now - day }),
      mail({ id: "new-2", accountId: "a", receivedAt: now - 2 * day }),
      mail({ id: "new-3", accountId: "a", receivedAt: now - 3 * day }),
      mail({ id: "b", accountId: "b", receivedAt: now - day }),
    ], { now, days: 30, perAccount: 2 });
    expect(kept.map((item) => item.id)).toEqual(["new-1", "b", "new-2"]);
  });

  it("可以按邮箱、分类和发件人标题搜索", () => {
    const rows: MailSummary[] = [
      { id: "1", accountId: "a", email: "a@qq.com", from: "支付宝 <notify@alipay.com>", subject: "验证码", receivedAt: 2, classification: "code", confidence: "high", source: "rule", code: "111111", display: "111111", candidates: ["111111"], domain: "alipay.com" },
      { id: "2", accountId: "b", email: "b@163.com", from: "商店 <news@shop.example>", subject: "本周优惠", receivedAt: 1, classification: "none", confidence: "low", source: "ai", code: null, display: null, candidates: [], domain: "shop.example" },
    ];
    expect(filterMails(rows, { accountId: "a" }).map((item) => item.id)).toEqual(["1"]);
    expect(filterMails(rows, { classification: "none" }).map((item) => item.id)).toEqual(["2"]);
    expect(filterMails(rows, { search: "优惠" }).map((item) => item.id)).toEqual(["2"]);
  });

  it("校正会写回发件域名偏好，并可以导出脱敏样本", () => {
    expect(correctionPreference({ action: "none", candidates: ["111111"], existing: {} })).toMatchObject({ muted: true });
    expect(correctionPreference({ action: "code", code: "222222", candidates: ["111111", "222222"], existing: { muted: true } })).toMatchObject({ muted: false, preferIndex: 1 });
    expect(correctionPreference({ action: "link", candidates: [], existing: { muted: true } }).muted).toBe(false);
    const fixture = toRedactedFixture({
      from: "商店 <news@shop.example>",
      subject: "验证码",
      text: "验证码 482913，收件人 ada@qq.com",
      expected: "482913",
      kind: "code",
      recipient: "ada@qq.com",
    });
    expect(JSON.stringify(fixture)).not.toContain("ada@qq.com");
    expect(fixture.expected).toBe("482913");
    expect(sanitizeMailText("<img src='https://evil.test/a.png'><p>验证码 482913</p>")).not.toContain("<img");
  });

  it("本地记录有上限，清空后消失，并且不跟账号一起删掉偏好", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "madao-mail-"));
    const store = new AccountStore(directory, unavailableSecretBox());
    store.load();
    store.updateSettings({ mailRetentionCount: 200, mailRetentionDays: 30 });
    const account = store.saveAccount({ provider: "qq", email: "a@qq.com", host: "imap.qq.com", port: 993, secret: "auth-code" });
    store.recordMail(mail({ id: "m1", accountId: account.id, receivedAt: Date.now(), classification: "maybe", candidates: ["111111", "222222"], code: "111111" }));
    const corrected = store.correctMail("m1", { kind: "code", code: "222222" });
    expect(corrected?.source).toBe("user");
    expect(corrected?.classification).toBe("code");
    expect(store.settings.senderPrefs["shop.example"]).toMatchObject({ muted: false, preferIndex: 1 });
    store.deleteAccount(account.id);
    expect(store.settings.senderPrefs["shop.example"]?.preferIndex).toBe(1);
    expect(store.getMail("m1")?.code).toBe("222222");
    store.clearMails();
    expect(store.mailIndex).toEqual([]);
    const reloaded = new AccountStore(directory, unavailableSecretBox());
    reloaded.load();
    expect(reloaded.mailIndex).toEqual([]);
    expect(reloaded.settings.senderPrefs["shop.example"]?.preferIndex).toBe(1);
  });
});
