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

interface AiChatInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  format?: AiFormat;
  system: string;
  user: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Shared transport for both AI formats: returns the model's raw text or a mapped failure. */
async function aiChatText(input: AiChatInput): Promise<{ text: string } | { failure: AiFailure; detail?: string }> {
  const format = input.format ?? "openai";
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
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
  } else {
    if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
    body = JSON.stringify({
      model: input.model,
      temperature: 0,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
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
    return { failure: aborted ? "timeout" : "network", detail: aborted ? "超时" : "网络" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) return { failure: "quota", detail: "429" };
  if (!response.ok) return { failure: "http", detail: String(response.status) };
  try {
    if (format === "anthropic") {
      const json = await response.json() as { content?: Array<{ type?: string; text?: string }> };
      return { text: (json.content || []).filter((block) => block.type === "text").map((block) => block.text || "").join("") };
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { text: json.choices?.[0]?.message?.content || "" };
  } catch {
    return { failure: "invalid", detail: "响应不是 JSON" };
  }
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
  const result = await aiChatText({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    format: input.format,
    system: aiPrompt(),
    user: buildAiUserText(input),
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
  });
  if ("failure" in result) return { verdict: null, failure: result.failure, detail: result.detail };
  const interpreted = interpretAiContent(result.text, original);
  if ("failure" in interpreted) return { verdict: null, failure: "invalid", detail: "模型没有返回可用 JSON" };
  if (interpreted.kind === "code" && !interpreted.accepted) {
    const word = /^[A-Za-z]{4,8}$/.test(interpreted.code) && boundedAlnum(interpreted.code, original);
    return { verdict: interpreted, failure: "invalid", detail: word ? "模型给出的是普通单词，已改用规则" : "模型给出的码不在原文里" };
  }
  return { verdict: interpreted };
}

export interface AiClassification {
  contentKind: "important" | "promo" | "subscription" | "normal" | "spammy";
  spamScore: number;
  reason: string;
}

export function classifyPrompt(): string {
  return '你负责给邮件分类。只回复一个 JSON 对象，不要加别的文字：{"contentKind":"important"|"promo"|"subscription"|"normal"|"spammy","spamScore":0到100的整数,"reason":"一句话理由"}。important 是账户、安全、账单、订单等重要通知；promo 是营销推广；subscription 是订阅资讯、周报；spammy 是诈骗、仿冒、垃圾邮件；其余 normal。spamScore 表示垃圾/诈骗风险：仿冒与诈骗 70 以上，强营销 35–60，正常通知 20 以下。结合发件域名是否可疑、话术是否紧迫、是否索要信息或钱财来判断。';
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

/** Gray-zone adjudication: ask the model for the mail's content kind and junk risk. */
export async function requestAiClassification(input: {
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
}): Promise<{ classification: AiClassification } | { failure: AiFailure; detail?: string }> {
  const result = await aiChatText({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    format: input.format,
    system: classifyPrompt(),
    user: buildAiUserText(input),
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
  });
  if ("failure" in result) return result;
  const record = parseJsonObject(result.text);
  const kinds = ["important", "promo", "subscription", "normal", "spammy"];
  if (!record || !kinds.includes(String(record.contentKind))) return { failure: "invalid", detail: "模型没有返回可用的分类" };
  const rawScore = typeof record.spamScore === "number" ? record.spamScore : Number(record.spamScore);
  if (!Number.isFinite(rawScore)) return { failure: "invalid", detail: "模型没有返回可用的风险分" };
  return {
    classification: {
      contentKind: record.contentKind as AiClassification["contentKind"],
      spamScore: Math.max(0, Math.min(100, Math.round(rawScore))),
      reason: typeof record.reason === "string" ? record.reason.slice(0, 120) : "",
    },
  };
}

/** Model-list endpoint: /v1/models when the root does not already end in /v1. */
export function modelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("地址需要以 http:// 或 https:// 开头");
  const root = trimmed.replace(/\/+$/, "");
  return /\/v1$/i.test(root) ? `${root}/models` : `${root}/v1/models`;
}

/** Sync the provider's model list. Tries the /v1/models path, then the bare
 * /models path, then — for Claude-format roots ending in /anthropic — the
 * sibling OpenAI root (DeepSeek serves /models only there). */
export async function fetchModelList(input: {
  baseUrl: string;
  apiKey: string;
  format?: AiFormat;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ models: string[] } | { failure: string }> {
  const root = input.baseUrl.trim().replace(/\/+$/, "");
  const candidates = [...new Set([modelsUrl(input.baseUrl), `${root}/models`])];
  if (/\/anthropic$/i.test(root)) candidates.push(`${root.replace(/\/anthropic$/i, "")}/v1/models`);
  const headers: Record<string, string> = {};
  if (input.apiKey) {
    headers.authorization = `Bearer ${input.apiKey}`;
    if (input.format === "anthropic") {
      headers["x-api-key"] = input.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    }
  }
  const fetchImpl = input.fetchImpl || fetch;
  let lastStatus = 0;
  for (const url of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? AI_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
      lastStatus = response.status;
      if (!response.ok) continue;
      const json = await response.json() as { data?: Array<{ id?: string }> };
      const models = [...new Set((json.data || []).map((item) => item.id || "").filter(Boolean))].sort();
      if (models.length) return { models };
      return { failure: "接口通了，但没有返回任何模型" };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { failure: aborted ? "同步超时，请重试" : "连不上这个地址，请检查地址和网络" };
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastStatus === 401 || lastStatus === 403) return { failure: "密钥不对，或这个密钥没有拉取模型列表的权限" };
  if (lastStatus === 404) return { failure: "这个站点没有开放 /models 接口，可以手动输入模型名" };
  return { failure: `同步失败（服务返回 ${lastStatus || "未知错误"}）` };
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
