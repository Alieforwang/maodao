import { senderDomain, type MailExtract } from "./extract.js";

export const AI_TIMEOUT_MS = 8_000;
export const AI_TEXT_LIMIT = 2_000;
export const AI_MIN_INTERVAL_MS = 1_500;

export type AiConfidence = "high" | "medium" | "low";
export type AiKind = "code" | "link" | "none";

/** Endpoint strings come from public docs. Model ids were not called from this machine. */
export interface AiPreset {
  id: "gemini" | "openrouter" | "groq" | "ollama" | "custom";
  name: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  endpointNote: string;
  modelNote: string;
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.5-flash",
    needsKey: true,
    endpointNote: "地址写在 Google 的 OpenAI 兼容文档里。",
    modelNote: "模型名未在本机调用过，以 AI Studio 列表为准。",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    needsKey: true,
    endpointNote: "地址是 OpenRouter 的 OpenAI 兼容入口。",
    modelNote: "带 :free 的模型名未在本机核对，免费额度可能变。",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    needsKey: true,
    endpointNote: "地址写在 Groq 的 OpenAI 兼容文档里。",
    modelNote: "模型名未在本机调用过，以 Groq 控制台为准。",
  },
  {
    id: "ollama",
    name: "本地 Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    needsKey: false,
    endpointNote: "地址写在 Ollama 的 OpenAI 兼容文档里，不出本机。",
    modelNote: "模型名取决于你本机已经拉取的标签。",
  },
  {
    id: "custom",
    name: "自定义",
    baseUrl: "",
    model: "",
    needsKey: true,
    endpointNote: "填写兼容 OpenAI 的 /v1 根地址。",
    modelNote: "模型名按服务商文档填写。",
  },
];

export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
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

export function maskForModel(value: string): string {
  return value
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
}

export function buildAiUserText(input: { subject: string; from: string; text: string }): string {
  const body = maskForModel(input.text).slice(0, AI_TEXT_LIMIT);
  return `Subject: ${maskForModel(input.subject).slice(0, 300)}\nFrom domain: ${senderDomain(input.from) || "unknown"}\nText:\n${body}`;
}

export function codeAppearsInOriginal(code: string, original: string): boolean {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > 32) return false;
  return original.includes(trimmed);
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
  if (ai.kind === "code" && ai.confidence === "high" && ai.code) {
    const candidate = { code: ai.code, display: ai.code, keyword: "ai", score: 100, source: "body" as const };
    return {
      ...rule,
      code: ai.code,
      display: ai.code,
      keyword: "ai",
      confidence: "high",
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

export function aiPrompt(): string {
  return '从邮件里找验证码。只回复一个 JSON 对象，不要加别的文字：{"kind":"code"|"link"|"none","code":"","confidence":"high"|"medium"|"low","reason":""}。kind 为 code 时，code 必须是原文里出现过的那一串。没有验证码就用 none。只有链接验证、没有数字或字母码时用 link，code 留空。';
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
  subject: string;
  from: string;
  text: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ verdict: AiVerdict | null; failure?: AiFailure; detail?: string }> {
  const original = `${input.subject}\n${input.text}`;
  let response: Response;
  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? AI_TIMEOUT_MS);
  try {
    response = await fetchImpl(chatCompletionsUrl(input.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        messages: [
          { role: "system", content: aiPrompt() },
          { role: "user", content: buildAiUserText(input) },
        ],
      }),
      signal: controller.signal,
    });
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
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    content = json.choices?.[0]?.message?.content || "";
  } catch {
    return { verdict: null, failure: "invalid", detail: "响应不是 JSON" };
  }
  const interpreted = interpretAiContent(content, original);
  if ("failure" in interpreted) return { verdict: null, failure: "invalid", detail: "模型没有返回可用 JSON" };
  if (interpreted.kind === "code" && !interpreted.accepted) return { verdict: interpreted, failure: "invalid", detail: "模型给出的码不在原文里" };
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
