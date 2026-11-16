import { describe, expect, it } from "vitest";
import {
  AI_PRESETS,
  buildAiUserText,
  cachedOrThrottled,
  interpretAiContent,
  mergeRuleAndAi,
  rememberAiCall,
  requestAiVerdict,
  shouldAskAi,
  type AiMemory,
} from "../src/shared/aiRecognize.js";
import { extractFromMail } from "../src/shared/extract.js";
import { decideNotification } from "../src/shared/decide.js";

const base = {
  subject: "Code",
  from: "Auth <noreply@example.com>",
  body: "Code 771234. Code 882211.",
  internalDate: 1_000_000,
  now: 1_000_000,
  uid: 8,
  baselineUid: 7,
  maxAgeMs: 5 * 60_000,
  notifyAllMail: false,
  alreadyNotified: false,
};

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } });
}

describe("AI 识别", () => {
  it("只保留 DeepSeek / Sub2API / 自定义三种预设，DeepSeek 两种格式地址来自官方文档", () => {
    expect(AI_PRESETS.map((item) => item.id)).toEqual(["deepseek", "sub2", "custom"]);
    const deepseek = AI_PRESETS.find((item) => item.id === "deepseek");
    expect(deepseek?.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(deepseek?.anthropicBaseUrl).toBe("https://api.deepseek.com/anthropic");
    expect(AI_PRESETS.find((item) => item.id === "sub2")?.baseUrl).toBe("");
  });

  it("Claude 格式走 /v1/messages、x-api-key 头，并能解析文本块响应", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    let seenBody = "";
    const result = await requestAiVerdict({
      baseUrl: "https://api.deepseek.com/anthropic",
      apiKey: "test-key",
      model: "deepseek-chat",
      format: "anthropic",
      subject: "验证码",
      from: "notify@example.com",
      text: "您的验证码是 482913",
      fetchImpl: async (url, init) => {
        seenUrl = String(url);
        seenHeaders = init?.headers as Record<string, string>;
        seenBody = String(init?.body || "");
        return new Response(JSON.stringify({ content: [{ type: "text", text: '{"kind":"code","code":"482913","confidence":"high","reason":"看到了"}' }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    expect(seenUrl).toBe("https://api.deepseek.com/anthropic/v1/messages");
    expect(seenHeaders["x-api-key"]).toBe("test-key");
    expect(seenHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(seenBody)).toMatchObject({ model: "deepseek-chat", max_tokens: 512 });
    expect(result.verdict).toMatchObject({ accepted: true, code: "482913" });
  });

  it("Claude 格式根地址已带 /v1 时不重复补", async () => {
    let seenUrl = "";
    await requestAiVerdict({
      baseUrl: "https://example.test/v1",
      apiKey: "k",
      model: "m",
      format: "anthropic",
      subject: "验证码",
      from: "notify@example.com",
      text: "您的验证码是 482913",
      fetchImpl: async (url) => {
        seenUrl = String(url);
        return new Response(JSON.stringify({ content: [{ type: "text", text: '{"kind":"none","code":"","confidence":"low","reason":"无"}' }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    expect(seenUrl).toBe("https://example.test/v1/messages");
  });

  it("发给模型的文本去掉邮箱和手机号，并截断", () => {
    const text = buildAiUserText({
      subject: "验证码",
      from: "Ada <ada@example.com>",
      recipient: "ada@example.com",
      text: `验证码 482913，手机 13800138000，邮箱 ada@example.com，+1 (415) 555-0123，https://x.example/v?token=SECRETTOKEN&u=ada%40example.com Bearer abcdefTOKEN ${"x".repeat(3000)}`,
    });
    expect(text).not.toContain("13800138000");
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("ada%40example.com");
    expect(text).not.toContain("555-0123");
    expect(text).not.toContain("SECRETTOKEN");
    expect(text).not.toContain("abcdefTOKEN");
    expect(text).toContain("482913");
    expect(text).toContain("From domain: example.com");
    expect(text.length).toBeLessThan(2300);
  });

  it("成功的 JSON 要能在原文里找到码", async () => {
    const result = await requestAiVerdict({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "mock",
      subject: "验证码",
      from: "notify@example.com",
      text: "您的验证码是 482913",
      fetchImpl: async () => jsonResponse('{"kind":"code","code":"482913","confidence":"high","reason":"看到了"}'),
    });
    expect(result.verdict).toMatchObject({ accepted: true, code: "482913", confidence: "high" });
  });

  it("非法 JSON、原文里没有的码、超时和 429 都不会当成验证码", async () => {
    const common = { baseUrl: "https://example.test/v1", apiKey: "test-key", model: "mock", subject: "验证码", from: "notify@example.com", text: "您的验证码是 482913" };
    const invalid = await requestAiVerdict({ ...common, fetchImpl: async () => jsonResponse("当然可以") });
    expect(invalid.failure).toBe("invalid");
    const hallucinated = await requestAiVerdict({ ...common, fetchImpl: async () => jsonResponse('{"kind":"code","code":"999999","confidence":"high","reason":"猜的"}') });
    expect(hallucinated.verdict?.accepted).toBe(false);
    const quota = await requestAiVerdict({ ...common, fetchImpl: async () => new Response("busy", { status: 429 }) });
    expect(quota.failure).toBe("quota");
    const timed = await requestAiVerdict({
      ...common,
      timeoutMs: 20,
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    });
    expect(timed.failure).toBe("timeout");
  });

  it("高置信且原文里有的码会盖过规则的中等结果，静音域名仍然不弹", () => {
    const rule = extractFromMail({ subject: base.subject, body: base.body, from: base.from });
    expect(rule.confidence).toBe("medium");
    const merged = mergeRuleAndAi(rule, { kind: "code", code: "882211", confidence: "high", reason: "原文里有", accepted: true });
    expect(merged).toMatchObject({ code: "882211", confidence: "medium" });
    const decision = decideNotification({ ...base, ai: { kind: "code", code: "882211", confidence: "high", reason: "原文里有", accepted: true } });
    expect(decision).toMatchObject({ action: "notify", reason: "maybe", code: "882211" });
    const muted = decideNotification({ ...base, senderPrefs: { "example.com": { muted: true } }, ai: { kind: "code", code: "882211", confidence: "high", reason: "", accepted: true } });
    expect(muted).toMatchObject({ action: "skip", reason: "muted" });
    expect(shouldAskAi({ confidence: "high" }, { enabled: true, baseUrl: "http://localhost:11434/v1", model: "llama3.2", format: "openai", everyMessage: false, needsKey: false }, false)).toBe(false);
    expect(shouldAskAi({ confidence: "medium" }, { enabled: true, baseUrl: "http://localhost:11434/v1", model: "llama3.2", format: "openai", everyMessage: false, needsKey: false }, false)).toBe(true);
  });

  it("同一封邮件只问一次，间隔太短就跳过", () => {
    const memory: AiMemory = { cache: new Map(), lastCallAt: 0 };
    expect(cachedOrThrottled(memory, "m1", 1_000).skip).toBe(false);
    rememberAiCall(memory, "m1", null, 1_000);
    expect(cachedOrThrottled(memory, "m1", 2_000)).toMatchObject({ skip: true, verdict: null });
    expect(cachedOrThrottled(memory, "m2", 1_200).skip).toBe(true);
    expect(cachedOrThrottled(memory, "m2", 3_000).skip).toBe(false);
  });

  it("解释器拒绝不在原文里的码", () => {
    const parsed = interpretAiContent('{"kind":"code","code":"000000","confidence":"high","reason":""}', "验证码 482913");
    expect("accepted" in parsed && parsed.accepted).toBe(false);
    const word = interpretAiContent('{"kind":"code","code":"use","confidence":"high","reason":""}', "Please use the app daily.");
    expect("accepted" in word && word.accepted).toBe(false);
  });

  it("纯字母的普通单词即使出现在原文里也不当成验证码", () => {
    const original = "Please use the app daily today.";
    for (const word of ["daily", "today", "Please"]) {
      const parsed = interpretAiContent(`{"kind":"code","code":"${word}","confidence":"high","reason":""}`, original);
      expect(parsed).toMatchObject({ accepted: false, code: word });
    }
    const kept = interpretAiContent('{"kind":"code","code":"A48291","confidence":"high","reason":""}', "Your code is A48291.");
    expect(kept).toMatchObject({ accepted: true, code: "A48291" });
    const rule = extractFromMail({ subject: "Hello", body: original, from: "notify@example.com" });
    const merged = mergeRuleAndAi(rule, { kind: "code", code: "daily", confidence: "high", reason: "", accepted: true });
    expect(merged.code).not.toBe("daily");
    expect(merged.keyword).not.toBe("ai");
  });
});
