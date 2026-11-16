import fs from "node:fs";
import path from "node:path";
import type { SecretBox } from "../shared/secrets.js";
import {
  DEFAULT_SETTINGS,
  type Account,
  type AccountDraft,
  type HistoryItem,
  type MailSummary,
  type SecretPayload,
  type Settings,
  type StoredMail,
} from "../shared/types.js";
import { applyCorrection, correctionPreference, pruneMails, sanitizeMailText } from "../shared/mailLog.js";
import { mergeOutlookAccounts } from "../shared/outlookMailbox.js";
import { PROVIDERS, normalizePassword } from "../shared/presets.js";
import { senderDomain } from "../shared/extract.js";
import {
  EMPTY_LEARNING,
  applySpamCorrection,
  learningProgress,
  recordAiCall,
  recordJudgedSpam,
  summarizeLearning,
  type LearningState,
  type LearningSummary,
} from "../shared/learning.js";
import type { AiClassification } from "../shared/aiRecognize.js";

interface ConfigFile {
  version: 1;
  settings: Settings;
  accounts: Account[];
  history: HistoryItem[];
  seen: string[];
  learning: LearningState;
}

const EMPTY: ConfigFile = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  accounts: [],
  history: [],
  seen: [],
  learning: structuredClone(EMPTY_LEARNING),
};

export function senderEmailOf(from: string): string {
  return (from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").toLowerCase();
}

/** History keeps the newest 200 entries and nothing older than 7 days (was: newest 20). */
export function pruneHistory(items: HistoryItem[], now = Date.now()): HistoryItem[] {
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  return items.filter((item) => item.receivedAt >= cutoff).slice(0, 200);
}

export class AccountStore {
  private config: ConfigFile = structuredClone(EMPTY);
  private secrets = new Map<string, SecretPayload>();
  private mails: StoredMail[] = [];
  private pendingOutlookMoves: Array<{ from: string; to: string }> = [];

  constructor(
    private readonly directory: string,
    private readonly box: SecretBox,
  ) {}

  get encryptionAvailable(): boolean {
    return this.box.available;
  }

  load(): void {
    fs.mkdirSync(this.directory, { recursive: true });
    const configPath = this.configFile();
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<ConfigFile>;
      const loadedSettings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } as Settings;
      // 1.3.0 起 AI 只保留 DeepSeek / Sub2API / 自定义三种预设与两种接口格式；
      // 旧预设（gemini/openrouter/groq/ollama）迁为自定义，保留用户已填的地址与模型。
      if (!["deepseek", "sub2", "custom"].includes(loadedSettings.aiPreset)) loadedSettings.aiPreset = "custom";
      if (loadedSettings.aiFormat !== "anthropic") loadedSettings.aiFormat = "openai";
      this.config = {
        version: 1,
        settings: loadedSettings,
        accounts: parsed.accounts || [],
        history: pruneHistory(parsed.history || []),
        seen: (parsed.seen || []).slice(-300),
        learning: {
          ...structuredClone(EMPTY_LEARNING),
          ...(parsed.learning || {}),
          senderAdjust: parsed.learning?.senderAdjust || {},
          domainAdjust: parsed.learning?.domainAdjust || {},
          days: parsed.learning?.days || {},
        },
      };
      const merged = mergeOutlookAccounts(this.config.accounts);
      if (merged.reassign.length) {
        const moved = new Map(merged.reassign.map((item) => [item.from, item.to]));
        this.config.accounts = merged.accounts;
        this.config.history = this.config.history.map((item) => ({ ...item, accountId: moved.get(item.accountId) || item.accountId }));
        this.pendingOutlookMoves = merged.reassign;
        this.persistConfig();
      }
    }
    this.mails = this.readMails();
    if (this.pendingOutlookMoves.length) {
      const moved = new Map(this.pendingOutlookMoves.map((item) => [item.from, item.to]));
      this.mails = this.mails.map((mail) => ({ ...mail, accountId: moved.get(mail.accountId) || mail.accountId }));
    }
    this.mails = this.prune(this.mails);
    this.writeMails();
    const secretsPath = this.secretsFile();
    if (this.box.available && fs.existsSync(secretsPath)) {
      const encoded = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as Record<string, string>;
      for (const [id, payload] of Object.entries(encoded)) {
        try {
          this.secrets.set(id, JSON.parse(this.box.decrypt(payload)) as SecretPayload);
        } catch {
          this.secrets.delete(id);
        }
      }
      for (const move of this.pendingOutlookMoves) {
        if (!this.secrets.has(move.to) && this.secrets.has(move.from)) this.secrets.set(move.to, this.secrets.get(move.from)!);
        this.secrets.delete(move.from);
      }
      if (this.pendingOutlookMoves.length) this.persistSecrets();
    }
    this.pendingOutlookMoves = [];
  }

  get settings(): Settings {
    return this.config.settings;
  }

  get accounts(): Account[] {
    return this.config.accounts;
  }

  get history(): HistoryItem[] {
    return this.config.history;
  }

  get mailIndex(): MailSummary[] {
    return this.mails.map(({ text: _text, displays: _displays, ...summary }) => summary);
  }

  getMail(id: string): StoredMail | undefined {
    return this.mails.find((mail) => mail.id === id);
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.config.settings = { ...this.config.settings, ...patch };
    this.persistConfig();
    if ("mailRetentionDays" in patch || "mailRetentionCount" in patch) {
      this.mails = this.prune(this.mails);
      this.writeMails();
    }
    return this.config.settings;
  }

  getSecret(id: string): SecretPayload | undefined {
    return this.secrets.get(id);
  }

  getAiKey(): string {
    return this.secrets.get("__ai_key__")?.apiKey || "";
  }

  hasAiKey(): boolean {
    return Boolean(this.getAiKey());
  }

  setAiKey(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed) {
      this.secrets.delete("__ai_key__");
      if (this.box.available) this.persistSecrets();
      return false;
    }
    return this.writeSecret("__ai_key__", { apiKey: trimmed });
  }

  hasSeen(messageId: string): boolean {
    return this.config.seen.includes(messageId);
  }

  remember(messageId: string): void {
    if (!messageId || this.config.seen.includes(messageId)) return;
    this.config.seen.push(messageId);
    this.config.seen = this.config.seen.slice(-300);
    this.persistConfig();
  }

  addHistory(item: HistoryItem): void {
    this.config.history = pruneHistory([item, ...this.config.history.filter((entry) => entry.id !== item.id)], item.receivedAt);
    this.persistConfig();
  }

  /** Stamp copiedAt on the newest history entry carrying this code, so every surface can show “已复制”. */
  markCopied(code: string): void {
    const item = this.config.history.find((entry) => entry.code === code);
    if (!item) return;
    item.copiedAt = Date.now();
    this.persistConfig();
  }

  recordMail(mail: StoredMail, replace = false): StoredMail {
    const next = { ...mail, text: sanitizeMailText(mail.text) };
    const index = this.mails.findIndex((item) => item.id === next.id);
    if (index >= 0 && !replace) return this.mails[index];
    if (index >= 0) this.mails[index] = next;
    else this.mails.unshift(next);
    this.mails = this.prune(this.mails);
    this.writeMails();
    return this.mails.find((item) => item.id === next.id) || next;
  }

  correctMail(id: string, action: { kind: "code" | "link" | "none"; code?: string }): StoredMail | undefined {
    const current = this.mails.find((mail) => mail.id === id);
    if (!current) return undefined;
    const updated = applyCorrection(current, action);
    const domain = current.domain;
    if (domain) {
      const prefs = { ...(this.config.settings.senderPrefs || {}) };
      prefs[domain] = correctionPreference({
        action: action.kind,
        code: action.code,
        candidates: current.candidates,
        existing: prefs[domain],
      });
      this.config.settings = { ...this.config.settings, senderPrefs: prefs };
      this.persistConfig();
    }
    return this.recordMail(updated, true);
  }

  get learning(): LearningState {
    return this.config.learning;
  }

  learningSummary(now = Date.now()): LearningSummary {
    return summarizeLearning(this.config.learning, now);
  }

  /** Learned score offsets for a sender, fed into classifySpam at ingest. */
  spamAdjustFor(from: string): { sender?: number; domain?: number } {
    const sender = this.config.learning.senderAdjust[senderEmailOf(from)];
    const domain = this.config.learning.domainAdjust[senderDomain(from)];
    return {
      ...(sender ? { sender } : {}),
      ...(domain ? { domain } : {}),
    };
  }

  noteJudgedSpam(now = Date.now()): void {
    recordJudgedSpam(this.config.learning, now);
    this.persistConfig();
  }

  noteAiCall(changed: boolean, ms: number, now = Date.now()): void {
    recordAiCall(this.config.learning, { changed, ms, now });
    this.persistConfig();
  }

  /**
   * Apply the AI's gray-zone verdict to a stored mail and account for it in
   * the learning stats. Returns the updated mail, or undefined when gone.
   */
  applyAiClassification(id: string, classification: AiClassification, ms: number, now = Date.now()): StoredMail | undefined {
    const current = this.mails.find((mail) => mail.id === id);
    if (!current) return undefined;
    const oldScore = current.spamScore ?? 0;
    const oldKind = current.contentKind;
    const changed = classification.contentKind !== oldKind || Math.abs(classification.spamScore - oldScore) >= 10;
    const updated: StoredMail = {
      ...current,
      contentKind: classification.contentKind,
      spamScore: classification.spamScore,
      aiJudged: true,
      spamReasons: [
        ...(current.spamReasons || []),
        { label: `AI 裁决：${classification.reason || "模型综合判断"}`, delta: classification.spamScore - oldScore },
      ],
    };
    if (classification.contentKind === "spammy" && oldKind !== "spammy") recordJudgedSpam(this.config.learning, now);
    recordAiCall(this.config.learning, { changed, ms, now });
    this.persistConfig();
    return this.recordMail(updated, true);
  }

  /**
   * The user says a mail is / is not junk. Updates the mail, teaches the
   * learning layer, and reports what was learned for the feedback banner.
   */
  correctMailSpam(
    id: string,
    isSpam: boolean,
    now = Date.now(),
  ): { mail: StoredMail; learned: { senderDelta: number; domainDelta: number; rate: number; corrections: number; progress: number } } | undefined {
    const current = this.mails.find((mail) => mail.id === id);
    if (!current) return undefined;
    const wasJudgedSpam = current.contentKind === "spammy";
    const learned = applySpamCorrection(this.config.learning, {
      sender: senderEmailOf(current.from),
      domain: current.domain || senderDomain(current.from),
      isSpam,
      wasJudgedSpam,
      now,
    });
    const oldScore = current.spamScore ?? 0;
    let spamScore = oldScore;
    let contentKind = current.contentKind;
    if (isSpam && !wasJudgedSpam) {
      spamScore = Math.max(oldScore, 75);
      contentKind = "spammy";
    } else if (!isSpam && wasJudgedSpam) {
      spamScore = Math.min(oldScore, 30);
      contentKind = "normal";
    }
    const updated: StoredMail = {
      ...current,
      contentKind,
      spamScore,
      spamReasons: [
        ...(current.spamReasons || []),
        { label: isSpam ? "你的纠正：这是垃圾邮件，已记住这个发件人" : "你的纠正：不是垃圾，已记住这个发件人", delta: spamScore - oldScore },
      ],
    };
    this.persistConfig();
    const mail = this.recordMail(updated, true);
    return {
      mail,
      learned: {
        ...learned,
        corrections: this.config.learning.corrections,
        progress: learningProgress(this.config.learning.corrections),
      },
    };
  }

  clearMails(): void {
    this.mails = [];
    this.writeMails();
  }

  clearHistory(): void {
    this.config.history = [];
    this.persistConfig();
  }

  setEnabled(id: string, enabled: boolean): void {
    const account = this.config.accounts.find((item) => item.id === id);
    if (!account) return;
    account.enabled = enabled;
    this.persistConfig();
  }

  setAlias(id: string, alias: string): void {
    const account = this.config.accounts.find((item) => item.id === id);
    if (!account) return;
    const next = alias.trim();
    account.alias = next || undefined;
    this.persistConfig();
  }

  replaceSecret(id: string, secret: SecretPayload): void {
    this.writeSecret(id, secret);
  }

  deleteAccount(id: string): void {
    this.config.accounts = this.config.accounts.filter((item) => item.id !== id);
    this.secrets.delete(id);
    this.mails = this.mails.filter((mail) => mail.accountId !== id);
    this.persistConfig();
    this.persistSecrets();
    this.writeMails();
  }

  saveAccount(draft: AccountDraft): Account {
    const preset = PROVIDERS[draft.provider];
    const email = draft.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱地址不正确。");
    if (!draft.host.trim()) throw new Error("需要填写 IMAP 服务器。");
    if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) throw new Error("端口不正确。");
    const existing = draft.id ? this.config.accounts.find((item) => item.id === draft.id) : undefined;
    const id = existing?.id || crypto.randomUUID();
    const previous = this.secrets.get(id);
    let secret = previous;
    if (draft.secret && draft.secret.trim()) {
      secret = { ...previous, password: normalizePassword(draft.provider, draft.secret) };
    }
    if (preset.authMethod === "password" && !secret?.password) throw new Error(`请填写${preset.secretLabel}。`);
    const persisted = secret ? this.writeSecret(id, secret) : false;
    const account: Account = {
      id,
      provider: draft.provider,
      email,
      host: draft.host.trim(),
      port: draft.port,
      secure: draft.secure !== false,
      authMethod: preset.authMethod,
      enabled: existing?.enabled ?? true,
      secretUpdatedAt: secret === previous ? existing?.secretUpdatedAt || Date.now() : Date.now(),
      secretPersisted: persisted,
    };
    if (existing) {
      const index = this.config.accounts.findIndex((item) => item.id === id);
      this.config.accounts[index] = account;
    } else {
      this.config.accounts.push(account);
    }
    this.persistConfig();
    return account;
  }

  saveOAuthAccount(input: {
    email: string;
    loginName?: string;
    imapUser?: string;
    alias?: string;
    replaceId?: string;
    host?: string;
    port?: number;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }): Account {
    const existing = (input.replaceId && this.config.accounts.find((item) => item.id === input.replaceId))
      || this.config.accounts.find((item) => item.provider === "outlook" && item.email.toLowerCase() === input.email.toLowerCase());
    const id = existing?.id || crypto.randomUUID();
    const persisted = this.writeSecret(id, {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
    });
    const account: Account = {
      id,
      provider: "outlook",
      email: input.email,
      host: input.host || existing?.host || PROVIDERS.outlook.host,
      port: input.port || existing?.port || PROVIDERS.outlook.port,
      secure: true,
      authMethod: "oauth",
      enabled: existing?.enabled ?? true,
      secretUpdatedAt: Date.now(),
      secretPersisted: persisted,
      loginName: input.loginName,
      imapUser: input.imapUser,
      alias: input.alias ?? existing?.alias,
    };
    if (existing) {
      const index = this.config.accounts.findIndex((item) => item.id === id);
      this.config.accounts[index] = account;
    } else {
      this.config.accounts.push(account);
    }
    this.persistConfig();
    return account;
  }

  private writeSecret(id: string, secret: SecretPayload): boolean {
    this.secrets.set(id, secret);
    if (!this.box.available) return false;
    this.persistSecrets();
    return true;
  }

  private persistConfig(): void {
    fs.mkdirSync(this.directory, { recursive: true });
    const safe: ConfigFile = {
      ...this.config,
      accounts: this.config.accounts.map((account) => ({ ...account })),
    };
    fs.writeFileSync(this.configFile(), JSON.stringify(safe, null, 2));
  }

  private persistSecrets(): void {
    if (!this.box.available) return;
    const encoded: Record<string, string> = {};
    for (const [id, secret] of this.secrets) {
      encoded[id] = this.box.encrypt(JSON.stringify(secret));
    }
    fs.writeFileSync(this.secretsFile(), JSON.stringify(encoded));
  }

  private configFile(): string {
    return path.join(this.directory, "config.json");
  }

  private secretsFile(): string {
    return path.join(this.directory, "secrets.json");
  }

  private mailsFile(): string {
    return path.join(this.directory, "mails.json");
  }

  private readMails(): StoredMail[] {
    const file = this.mailsFile();
    if (!fs.existsSync(file)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as StoredMail[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeMails(): void {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(this.mailsFile(), JSON.stringify(this.mails));
  }

  private prune(mails: StoredMail[]): StoredMail[] {
    const days = this.config.settings.mailRetentionDays || 30;
    const perAccount = this.config.settings.mailRetentionCount || 500;
    return pruneMails(mails, { now: Date.now(), days, perAccount });
  }
}
