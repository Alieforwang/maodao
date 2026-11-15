import { describe, expect, it } from "vitest";
import { extractFromMail, extractVerificationCode } from "../src/shared/extract.js";
import { MAIL_SAMPLES, REQUIRED_SAMPLES } from "./fixtures/mails.js";

function resultOf(sample: (typeof MAIL_SAMPLES)[number]) {
  const body = sample.html ? `${sample.text}\n${sample.html}` : sample.text;
  return extractFromMail({ subject: sample.subject, body });
}

describe("验证码样本集", () => {
  it("覆盖产品里点名的失败样本，并且数量达标", () => {
    const blob = MAIL_SAMPLES.map((sample) => `${sample.subject}\n${sample.text}`).join("\n");
    for (const phrase of REQUIRED_SAMPLES) expect(blob).toContain(phrase);
    const negatives = MAIL_SAMPLES.filter((sample) => sample.expect === null && !sample.link);
    expect(MAIL_SAMPLES.length).toBeGreaterThanOrEqual(150);
    expect(negatives.length / MAIL_SAMPLES.length).toBeGreaterThanOrEqual(1 / 3);
  });

  it("该识别的验证码准确率不低于 98%，不该弹的误报不超过 1%", () => {
    let detect = 0;
    let exact = 0;
    let silent = 0;
    let falsePopup = 0;
    const misses: string[] = [];
    const alarms: string[] = [];
    for (const sample of MAIL_SAMPLES) {
      const result = resultOf(sample);
      const popup = result.kind === "code" || result.kind === "maybe" || result.kind === "link";
      if (sample.expect) {
        detect += 1;
        if (result.code === sample.expect) exact += 1;
        else misses.push(`${sample.id}: ${result.code} !== ${sample.expect}`);
      } else if (sample.link) {
        if (result.kind !== "link" || result.code) misses.push(`${sample.id}: expected link, got ${result.kind} ${result.code}`);
      } else {
        silent += 1;
        if (popup) {
          falsePopup += 1;
          alarms.push(`${sample.id}: ${result.kind} ${result.code}`);
        }
      }
    }
    const accuracy = exact / detect;
    const falseRate = falsePopup / silent;
    console.log(JSON.stringify({ samples: MAIL_SAMPLES.length, detect, exact, accuracy, silent, falsePopup, falseRate }));
    expect(accuracy, misses.slice(0, 12).join("\n")).toBeGreaterThanOrEqual(0.98);
    expect(falseRate, alarms.slice(0, 12).join("\n")).toBeLessThanOrEqual(0.01);
    expect(misses.filter((item) => item.includes("expected link"))).toEqual([]);
  });

  it("单封邮件提取低于 20ms", () => {
    const sample = MAIL_SAMPLES[0];
    resultOf(sample);
    const started = performance.now();
    for (const item of MAIL_SAMPLES) resultOf(item);
    const elapsed = performance.now() - started;
    expect(elapsed / MAIL_SAMPLES.length).toBeLessThan(20);
  });

  it("分组验证码复制时去掉分隔符，展示时保留", () => {
    const grouped = extractVerificationCode("Your code: 123-456");
    expect(grouped?.code).toBe("123456");
    expect(grouped?.display).toBe("123-456");
  });
});
