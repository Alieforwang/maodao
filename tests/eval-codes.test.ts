import { describe, expect, it } from "vitest";
import { mergeRuleAndAi, type AiVerdict } from "../src/shared/aiRecognize.js";
import * as extract from "../src/shared/extract.js";
import { classifyFixture, loadFixtures, type CodeFixture } from "./codeFixtures.js";

export function evaluate(samples: CodeFixture[]) {
  let detect = 0;
  let exact = 0;
  let silent = 0;
  let falsePopup = 0;
  let links = 0;
  let linkHit = 0;
  let marketing = 0;
  let marketingLink = 0;
  const failures: string[] = [];
  for (const sample of samples) {
    const result = classifyFixture(sample);
    const popup = Boolean(result.code);
    if (sample.expected) {
      detect += 1;
      if (result.code === sample.expected) exact += 1;
      else failures.push(`${sample.id}: ${result.code} !== ${sample.expected}`);
    } else if (sample.kind === "link") {
      links += 1;
      if (result.kind === "link" && !result.code) linkHit += 1;
      else failures.push(`${sample.id}: expected link, got ${result.kind} ${result.code}`);
    } else {
      silent += 1;
      if (popup || result.kind === "link") {
        falsePopup += 1;
        failures.push(`${sample.id}: false ${result.kind} ${result.code}`);
      }
    }
    if (sample.note === "marketing") {
      marketing += 1;
      if (result.kind === "link") marketingLink += 1;
    }
  }
  return {
    samples: samples.length,
    detect,
    exact,
    accuracy: detect ? exact / detect : 0,
    silent,
    falsePopup,
    falseRate: silent ? falsePopup / silent : 0,
    links,
    linkHit,
    linkRate: links ? linkHit / links : 0,
    marketing,
    marketingLink,
    negativeShare: silent / samples.length,
    failures,
  };
}

describe("验证码样本评估", () => {
  const samples = loadFixtures();
  const report = evaluate(samples);

  it("样本数量、反例比例和语言覆盖", () => {
    expect(samples.length).toBeGreaterThanOrEqual(150);
    expect(report.negativeShare).toBeGreaterThanOrEqual(1 / 3);
    expect(report.links).toBeGreaterThanOrEqual(10);
    for (const lang of ["zh-Hant", "ja", "ko", "es", "pt", "de", "fr", "ru"]) {
      expect(samples.filter((item) => item.lang === lang && item.expected).length).toBeGreaterThanOrEqual(3);
    }
    for (const id of ["bug-promo", "bug-invite", "bug-reference", "bug-grouped", "bug-letters", "bug-use"]) {
      expect(samples.some((item) => item.id === id)).toBe(true);
    }
  });

  it("识别准确率不低于 98%，误报不超过 1%，链接种类不低于 90%", () => {
    console.log(JSON.stringify({ ...report, failures: report.failures.slice(0, 20) }));
    expect(report.accuracy, report.failures.slice(0, 12).join("\n")).toBeGreaterThanOrEqual(0.98);
    expect(report.falseRate, report.failures.filter((item) => item.includes("false")).slice(0, 8).join("\n")).toBeLessThanOrEqual(0.01);
    expect(report.linkRate).toBeGreaterThanOrEqual(0.9);
    expect(report.marketingLink).toBe(0);
  });

  it("10 万字节 HTML 单封低于 20ms", () => {
    const html = `<html><body>${"<p>订单号 202411120001 金额 12.50 运单 SF1234567890</p>".repeat(2500)}<p>您的验证码是 <b>582916</b></p></body></html>`;
    expect(html.length).toBeGreaterThan(100_000);
    const started = performance.now();
    const result = extract.extractFromMail({ subject: "验证码", html, from: "安全 <secure@example.com>" });
    expect(performance.now() - started).toBeLessThan(20);
    expect(result.code).toBe("582916");
  });

  it("可选 AI 模式只接受原文里存在的码", () => {
    const missed = extract.extractFromMail({ subject: "hello", body: "please use 482913 today", from: "a@example.com" });
    const merged = mergeRuleAndAi(missed, { kind: "code", code: "482913", confidence: "high", reason: "mock", accepted: true });
    expect(merged).toMatchObject({ code: "482913", confidence: "medium" });
    const hallucinated = mergeRuleAndAi(missed, { kind: "code", code: "999999", confidence: "high", reason: "guess", accepted: false });
    expect(hallucinated.code).not.toBe("999999");
    if (process.env.MADAO_EVAL_AI === "1") {
      const withMock = samples.filter((sample) => sample.expected).every((sample) => {
        const rule = extract.extractFromMail({ subject: sample.subject, body: sample.text || "", html: sample.html, from: sample.from });
        const verdict: AiVerdict = { kind: "code", code: sample.expected || "", confidence: "high", reason: "mock", accepted: true };
        return mergeRuleAndAi(rule, verdict).code === sample.expected;
      });
      expect(withMock).toBe(true);
    }
  });
});
