import { describe, expect, it } from "vitest";
import { parseValidMinutes } from "../src/shared/extract";
import { pruneHistory } from "../src/main/store";
import type { HistoryItem } from "../src/shared/types";

describe("parseValidMinutes", () => {
  it("中文「N 分钟内有效」", () => {
    expect(parseValidMinutes("您的验证码是 738291，5分钟内有效，请勿泄露。")).toBe(5);
    expect(parseValidMinutes("验证码 10 分钟内有效")).toBe(10);
  });
  it("中文「N 分钟后失效」与有效期表述", () => {
    expect(parseValidMinutes("该验证码将于30分钟后失效")).toBe(30);
    expect(parseValidMinutes("有效期为15分钟")).toBe(15);
    expect(parseValidMinutes("请在 5 分钟内完成验证")).toBe(5);
  });
  it("小时换算成分钟", () => {
    expect(parseValidMinutes("链接 1 小时内有效")).toBe(60);
    expect(parseValidMinutes("This code is valid for 2 hours")).toBe(120);
  });
  it("英文常见表述", () => {
    expect(parseValidMinutes("Your code expires in 10 minutes")).toBe(10);
    expect(parseValidMinutes("Please enter it within 5 minutes")).toBe(5);
  });
  it("没写就不猜", () => {
    expect(parseValidMinutes("您的验证码是 738291，请及时使用。")).toBeNull();
    expect(parseValidMinutes("")).toBeNull();
  });
  it("离谱的数值不采信", () => {
    expect(parseValidMinutes("9999 分钟内有效")).toBeNull();
  });
});

function item(id: string, receivedAt: number): HistoryItem {
  return { id, accountId: "a", email: "a@qq.com", code: "123456", service: "测试", subject: "", from: "x@y.com", messageId: id, receivedAt };
}

describe("pruneHistory", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("丢掉 7 天以前的", () => {
    const kept = pruneHistory([item("new", now - 1000), item("old", now - 8 * 86_400_000)], now);
    expect(kept.map((entry) => entry.id)).toEqual(["new"]);
  });
  it("最多保留 200 条", () => {
    const many = Array.from({ length: 250 }, (_, i) => item(`m${i}`, now - i * 1000));
    expect(pruneHistory(many, now)).toHaveLength(200);
  });
});
