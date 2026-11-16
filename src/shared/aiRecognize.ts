import { senderDomain, type MailExtract } from "./extract.js";
import { redactSensitive } from "./fixtureExport.js";

export const AI_TIMEOUT_MS = 8_000;
export const AI_TEXT_LIMIT = 2_000;
export const AI_MIN_INTERVAL_MS = 1_500;

export type AiConfidence = "high" | "medium" | "low";
export type AiKind = "code" | "link" | "none";

export type AiFormat = "openai" | "anthropic";

/**
 * 只保留两种接口格式：OpenAI 兼容（/chat/completions）和 Claude 格式（Anthropic /v1/messages）。
 * DeepSeek 官方地址来自其公开文档，且 2026-11-16 已用真实密钥在开发机上实测两种格式均可返回验证码 JSON。
 */
export interface AiPreset {
  id: "deepseek" | "sub2" | "custom";
  name: string;
  /** OpenAI 格式的根地址。 */
  baseUrl: string;
  /** Claude 格式的根地址；为空表示与 baseUrl 相同或由用户填写。 */
  anthropicBaseUrl: string;
  model: string;
  needsKey: boolean;
  endpointNote: string;
  modelNote: string;
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    anthropicBaseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-chat",
    needsKey: true,
    endpointNote: "地址是 DeepSeek 官方文档里的两种格式入口，切换格式会自动换地址。",
    modelNote: "deepseek-chat 已实测可用；deepseek-reasoner 也可以填，以控制台为准。",
  },
  {
    id: "sub2",
    name: "Sub2API 站点",
    baseUrl: "",
    anthropicBaseUrl: "",
    model: "",
    needsKey: true,
    endpointNote: "填你自己的 Sub2API 站点根地址。站点一般同时支持 OpenAI 和 Claude 两种格式，根地址按站点文档填。",
    modelNote: "模型名未预填，填站点里可用的模型，以站点的模型列表为准。",
  },
  {
    id: "custom",
    name: "自定义",
    baseUrl: "",
    anthropicBaseUrl: "",
    model: "",
    needsKey: true,
    endpointNote: "填写服务商的根地址，再选它支持的接口格式。",
    modelNote: "模型名按服务商文档填写。",
  },
];

export function presetBaseUrl(preset: AiPreset, format: AiFormat): string {
  return format === "anthropic" ? (preset.anthropicBaseUrl || preset.baseUrl) : preset.baseUrl;
}

export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  format: AiFormat;
  everyMessage: boolean;
  needsKey: boolean;
}

export interface AiVerdict {
  kind: AiKind;
  code: string;
  confidence: AiConfidence;
  reason: string;
  accepted: boolean;
}

export type AiFailure = "timeout" | "quota" | "network" | "invalid" | "http";

export function shouldAskAi(rule: { confidence: string }, settings: AiSettings, hasKey: boolean): boolean {
  if (!settings.enabled || !settings.baseUrl.trim() || !settings.model.trim()) return false;
  if (settings.needsKey && !hasKey) return false;
  if (settings.everyMessage) return true;
  return rule.confidence !== "high";
}

export function maskForModel(value: string, recipient?: string): string {
  return redactSensitive(value, recipient);
}

export function buildAiUserText(input: { subject: string; from: string; text: string; recipient?: string }): string {
  const body = maskForModel(input.text, input.recipient).slice(0, AI_TEXT_LIMIT);
  return `Subject: ${maskForModel(input.subject, input.recipient).slice(0, 300)}\nFrom domain: ${senderDomain(input.from) || "unknown"}\nText:\n${body}`;
}

function boundedAlnum(code: string, original: string): boolean {
  const trimmed = code.trim();
  if (!/^[A-Za-z0-9]{4,8}$/.test(trimmed)) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9])${trimmed}(?![A-Za-z0-9])`);
  return pattern.test(original);
}

export function codeAppearsInOriginal(code: string, original: string): boolean {
  const trimmed = code.trim();
  if (!/\d/.test(trimmed)) return false;
  return boundedAlnum(trimmed, original);
}

export function aiNeedsKey(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return false;
  } catch {
    return true;
  }
  return true;
}

export function interpretAiContent(raw: string, original: string): AiVerdict | { failure: "invalid" } {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { failure: "invalid" };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { failure: "invalid" };
    }
  }
  if (!parsed || typeof parsed !== "object") return { failure: "invalid" };
  const record = parsed as Record<string, unknown>;
  const kind = record.kind;
  const confidence = record.confidence;
  if (kind !== "code" && kind !== "link" && kind !== "none") return { failure: "invalid" };
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") return { failure: "invalid" };
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const reason = typeof record.reason === "string" ? record.reason.slice(0, 160) : "";
  if (kind === "code") {
    return { kind, code, confidence, reason, accepted: codeAppearsInOriginal(code, original) };
  }
  return { kind, code: "", confidence, reason, accepted: true };
}

export function mergeRuleAndAi(rule: MailExtract, ai: AiVerdict | null): MailExtract {
  if (!ai?.accepted) return rule;
  if (rule.confidence === "high") return rule;
  if (ai.kind === "code" && ai.code && ai.confidence !== "low" && /\d/.test(ai.code)) {
    const candidate = { code: ai.code, display: ai.code, keyword: "ai", score: 60, source: "body" as const };
    return {
      ...rule,
      code: ai.code,
      display: ai.code,
      keyword: "ai",
      confidence: "medium",
      kind: "code",
      candidates: [candidate, ...rule.candidates.filter((item) => item.code !== ai.code)].slice(0, 3),
    };
  }
  if (ai.kind === "link" && rule.kind === "none" && rule.verifyUrl) {
    return { ...rule, kind: "link", keyword: "ai" };
  }
  return rule;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("地址需要以 http:// 或 https:// 开头");
  return `${trimmed.replace(/\/+$/, "")}/chat/completions`;
}

/** Claude 格式入口：根地址以 /v1 结尾时只补 /messages，否则补 /v1/messages。 */
export function messagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("地址需要以 http:// 或 https:// 开头");
  const root = trimmed.replace(/\/+$/, "");
  return /\/v1$/i.test(root) ? `${root}/messages` : `${root}/v1/messages`;
}

export function aiPrompt(): string {
  return '从邮件里找验证码。只回复一个 JSON 对象，不要加别的文字：{"kind":"code"|"link"|"none","code":"","confidence":"high"|"medium"|"low","reason":""}。kind 为 code 时，code 必须是原文里出现过的那一串，并且至少包含一位数字。不要把 daily、today 这类普通单词当成验证码。没有验证码就用 none。只有链接验证、没有数字或字母码时用 link，code 留空。';
}

export interface ChatResult {
  ok: true;
  content: string;
}

export interface ChatProblem {
  ok: false;
  failure: AiFailure;
  detail: string;
}

export async function requestAiVerdict(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  format?: AiFormat;
  subject: string;
  from: string;
  text: string;
  recipient?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ verdict: AiVerdict | null; failure?: AiFailure; detail?: string }> {
  const original = `${input.subject}\n${input.text}`;
  const format = input.format ?? "openai";
  const userText = buildAiUserText(input);
  const url = format === "anthropic" ? messagesUrl(input.baseUrl) : chatCompletionsUrl(input.baseUrl);
  const headers: Record<string, string> = { "content-type": "application/json" };
  let body: string;
  if (format === "anthropic") {
    if (input.apiKey) headers["x-api-key"] = input.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = JSON.stringify({
      model: input.model,
      max_tokens: 512,
      temperature: 0,
      system: aiPrompt(),
      messages: [{ role: "user", content: userText }],
    });
  } else {
    if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
    body = JSON.stringify({
      model: input.model,
      temperature: 0,
      messages: [
        { role: "system", content: aiPrompt() },
        { role: "user", content: userText },
      ],
    });
  }
  let response: Response;
  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? AI_TIMEOUT_MS);
  try {
    response = await fetchImpl(url, { method: "POST", headers, body, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { verdict: null, failure: aborted ? "timeout" : "network", detail: aborted ? "超时" : "网络" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) return { verdict: null, failure: "quota", detail: "429" };
  if (!response.ok) return { verdict: null, failure: "http", detail: String(response.status) };
  let content = "";
  try {
    if (format === "anthropic") {
      const json = await response.json() as { content?: Array<{ type?: string; text?: string }> };
      content = (json.content || []).filter((block) => block.type === "text").map((block) => block.text || "").join("");
    } else {
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      content = json.choices?.[0]?.message?.content || "";
    }
  } catch {
    return { verdict: null, failure: "invalid", detail: "响应不是 JSON" };
  }
  const interpreted = interpretAiContent(content, original);
  if ("failure" in interpreted) return { verdict: null, failure: "invalid", detail: "模型没有返回可用 JSON" };
  if (interpreted.kind === "code" && !interpreted.accepted) {
    const word = /^[A-Za-z]{4,8}$/.test(interpreted.code) && boundedAlnum(interpreted.code, original);
    return { verdict: interpreted, failure: "invalid", detail: word ? "模型给出的是普通单词，已改用规则" : "模型给出的码不在原文里" };
  }
  return { verdict: interpreted };
}

export function statusLine(failure: AiFailure | undefined, detail?: string): string {
  if (failure === "timeout") return "接口超时，已改用规则";
  if (failure === "quota") return "额度不足，已改用规则";
  if (failure === "network") return "连不上服务，已改用规则";
  if (failure === "invalid") return detail || "模型结果不可用，已改用规则";
  if (failure === "http") return "服务返回错误，已改用规则";
  return "上次识别正常";
}

export interface AiMemory {
  cache: Map<string, AiVerdict | null>;
  lastCallAt: number;
}

export function rememberAiCall(memory: AiMemory, id: string, verdict: AiVerdict | null, now: number): void {
  memory.cache.set(id, verdict);
  memory.lastCallAt = now;
  if (memory.cache.size > 500) {
    const oldest = memory.cache.keys().next().value;
    if (oldest) memory.cache.delete(oldest);
  }
}

export function cachedOrThrottled(memory: AiMemory, id: string, now: number): { skip: true; verdict: AiVerdict | null; status?: string } | { skip: false } {
  if (memory.cache.has(id)) return { skip: true, verdict: memory.cache.get(id) ?? null };
  if (memory.lastCallAt && now - memory.lastCallAt < AI_MIN_INTERVAL_MS) {
    return { skip: true, verdict: null, status: "请求太密，这次用规则结果" };
  }
  return { skip: false };
}
