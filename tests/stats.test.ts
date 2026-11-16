import { describe, expect, it } from "vitest";
import { computeOverviewStats } from "../src/shared/stats.js";
import type { HistoryItem, MailSummary } from "../src/shared/types.js";

const NOW = new Date("2026-11-16T15:00:00").getTime();
const DAY = 86_400_000;

let seq = 0;
function mail(partial: Partial<MailSummary>): MailSummary {
  return {
    id: `m${seq++}`,
    accountId: "a1",
    email: "me@qq.com",
    from: "Someone <s@x.example>",
    subject: "hi",
    receivedAt: NOW,
    classification: "none",
    confidence: "low",
    source: "rule",
    code: null,
    display: null,
    candidates: [],
    domain: "x.example",
    ...partial,
  };
}

function code(receivedAt: number): HistoryItem {
  return {
    id: `h${seq++}`,
    accountId: "a1",
    email: "me@qq.com",
    code: "123456",
    service: "GitHub",
    subject: "code",
    from: "noreply@github.com",
    messageId: `msg${seq}`,
    receivedAt,
  };
}

describe("computeOverviewStats", () => {
  it("range=7 series has 7 daily buckets ending today", () => {
    const stats = computeOverviewStats({
      mails: [mail({ receivedAt: NOW }), mail({ receivedAt: NOW - 2 * DAY })],
      history: [code(NOW)],
      range: 7,
      now: NOW,
    });
    expect(stats.series).toHaveLength(7);
    expect(stats.series[6].label).toBe("今天");
    expect(stats.series[6].mails).toBe(1);
    expect(stats.series[6].codes).toBe(1);
    expect(stats.series[4].mails).toBe(1);
    expect(stats.rangeMails).toBe(2);
    expect(stats.rangeCodes).toBe(1);
    expect(stats.todayMails).toBe(1);
  });

  it("range=1 series is 24 hourly buckets", () => {
    const stats = computeOverviewStats({ mails: [mail({ receivedAt: NOW })], history: [], range: 1, now: NOW });
    expect(stats.series).toHaveLength(24);
    expect(stats.series[15].mails).toBe(1);
  });

  it("type distribution prefers the code bucket, then contentKind", () => {
    const stats = computeOverviewStats({
      mails: [
        mail({ classification: "code", contentKind: "important" }),
        mail({ contentKind: "promo" }),
        mail({ contentKind: "spammy", spamScore: 88 }),
        mail({}),
      ],
      history: [],
      range: 7,
      now: NOW,
    });
    const byKind = Object.fromEntries(stats.typeDist.map((item) => [item.kind, item.count]));
    expect(byKind["验证码"]).toBe(1);
    expect(byKind["推广"]).toBe(1);
    expect(byKind["疑似垃圾"]).toBe(1);
    expect(byKind["普通"]).toBe(1);
    expect(stats.rangeSpammy).toBe(1);
    expect(stats.spamShare).toBe(25);
  });

  it("risk buckets and heat slots line up with scores and hours", () => {
    const stats = computeOverviewStats({
      mails: [mail({ spamScore: 10 }), mail({ spamScore: 50 }), mail({ spamScore: 95 })],
      history: [],
      range: 7,
      now: NOW,
    });
    expect(stats.riskBuckets).toEqual([1, 0, 1, 0, 0, 1]);
    // 15:00 falls in slot 3 (12–16); today is day index 6.
    const cell = stats.heat.find(([day, slot]) => day === 6 && slot === 3);
    expect(cell?.[2]).toBe(3);
    expect(stats.heatDays[6]).toBe("今天");
  });
});
