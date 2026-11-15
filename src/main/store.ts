import fs from "node:fs";
import path from "node:path";
import type { SecretBox } from "../shared/secrets.js";
import {
  DEFAULT_SETTINGS,
  type Account,
  type AccountDraft,
  type HistoryItem,
  type SecretPayload,
  type Settings,
} from "../shared/types.js";
import { PROVIDERS, normalizePassword } from "../shared/presets.js";

interface ConfigFile {
  version: 1;
  settings: Settings;
  accounts: Account[];
  history: HistoryItem[];
  seen: string[];
}

const EMPTY: ConfigFile = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  accounts: [],
  history: [],
  seen: [],
};

export class AccountStore {
  private config: ConfigFile = structuredClone(EMPTY);
  private secrets = new Map<string, SecretPayload>();

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
      this.config = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        accounts: parsed.accounts || [],
        history: (parsed.history || []).slice(0, 20),
        seen: (parsed.seen || []).slice(-300),
      };
    }
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
    }
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

  updateSettings(patch: Partial<Settings>): Settings {
    this.config.settings = { ...this.config.settings, ...patch };
    this.persistConfig();
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
    this.config.history = [item, ...this.config.history.filter((entry) => entry.id !== item.id)].slice(0, 20);
    this.persistConfig();
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
    this.persistConfig();
    this.persistSecrets();
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
}
